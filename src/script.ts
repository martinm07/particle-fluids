import * as THREE from "three";

import { isLittleEndianness } from "./helper";

import { Algorithm } from "./Algorithm";
import { ParticleRender } from "./ParticleRender";

const MAX_NEIGHBOURS = 64;
// There is an issue with non-power-of-2 values here- quite mysterious
const N_PARTICLES = 16 ** 2;

console.log(`CPU is ${isLittleEndianness ? "little-endian" : "big-endian"}`);

const container = document.querySelector<HTMLDivElement>("#scene-container")!;

// #region PBF Algorithm
/*
Here's a list of "chunks", which must be computed sequentially (one after the other),
 but whose work within can be done in parallel.
=-=-= CHUNK I =-=-=
For every particle:
  - Apply forces (e.g. gravity, user interaction), then 
     Perform euclidean step (x*)
=-=-= CHUNK II =-=-=
For every particle:
  - Find neighbouring particles
=-=-= CHUNK III* =-=-=
For every particle:
  For every one of their neighbours:
    - Calculate W(pᵢ - pⱼ) i.e. poly6 kernel outputs
    - Calculate ∇W(pᵢ - pⱼ) w.r.t. pᵢ/pⱼ (both essentially same), then
       Calculate ∇pₖCᵢ
    - Calculate ∂/∂pᵢ[(vⱼ - vᵢ) x ∇pⱼW(pᵢ - pⱼ)], which I'll now call ∇ωᵢⱼ
=-=-= CHUNK IV* =-=-=
For every particle:
  - Calculate ∇pₖCᵢ where k == i, then
     Calculate λᵢ
  - Calculate s_corr (artificial pressure term)
=-=-= CHUNK V* =-=-=
For every particle:
  - Calculate ∆pᵢ, then
     Create x*_temp = x* + ∆pᵢ, then
     Perform collision detection & response on x*_temp
Assign x* <- x*_temp, for every particle
=-=-= CHUNK VI =-=-=
For every particle:
  - Assign v <- (1/∆t)(x* - x), then
     - Calculate vorticity force and assign v <- v + f_vorticity
     - Calculate viscosity force and assign v <- v + f_viscosity
  - Assign x <- x*
=-=-=-=-=-=-=-=-=-=-=
The chunks with a "*" are in the solver loop, and so will repeat (chunks 3-5) for a number of iterations.
Perhaps not all of this will be parallelized, as some computations may be too small to have- basically- their 
own kernel (e.g. s_corr), and so we might merge some of these together (e.g. into ∆p calculation). Of course
with enough particles there will be a point where the above will overtake anything else (I'm guessing).

Chunk I updates the velocity with whatever forces there are this time step, then moves the current positions
 using that velocity. Since we calculate neighbours on this euclidean step (as opposed to the current positions),
 we need all of them before we start start looking, pushing us to a...
Chunk II finds particle neighbourhoods, whish is the last thing we do before the constraint solving loop.
Chunk III precomputes results that will be used in the rest of the chunks. Everything else needs lists
 of these values and so can't be computed before we know all of them, thus pushing us into a...
Chunk IV computes all the λs, before we compute any ∆p. That's because we also need the λs of the particle's 
 neighbours. In the meantime we can also precompute s_corr.
Chunk V differs slightly from the original pseudocode algorithm. Rather than computing ALL the ∆ps before updating
 the x*s (done because we need neighbouring x*s to be original), we store it in a new variable on the particle, which
 we then perform the collision response on. This should be faster, better enforce collision bounds, and have the same
 memory efficiency (since we don't need to store ∆p in turn).
Chunk VI updates velocity for the next time step and finishes the current time step by assigng the constraint-solved
 euclidean step of x (x*) as the new x. Note that calculating both vorticity and viscosity forces require knowing the
 current velocity, and so results may be different if you swap the order of these two lines, or compute both before 
 applying them.
*/
// #endregion

// #region Implementation Details
/*
Every chunk gets its own GPUComputationRenderer. 
Each one will only have one variable, and none of them will have any dependencies.
Rather, the `gpuCompute`s will feed into each other as a pipeline.
In order to increase parallelity within the chunks, we make input textures bigger by copying
the values one or two times. Then, we pass another uniform that's a "mask," telling the shader
what computation it should perform. The overall goal is to always loop over the particles in
parallel, and to minimize the work done in looping over neighbours. The one task that cannot
be parallelized- finding neighbours- is done by reading the renderTarget's texture pixels and
doing it in the JavaScript here.
Following is a diagram of the implemented algorithm:

---------------- uniform forces;
| GPUCompute 1 | uniform P_v;
| in: P x 2    |
----------------
            ↓
read pixels,
interpret positions,
find neighbours per particle,
create texture of "for every particle, for every neighbour"; 
`N` for positions and `N_v` for velocites.
            ↓
---------------- uniform GPUC2_Mask;
| GPUCompute 3 | uniform N_v;
| in: N x 3    |
----------------
            ↓
---------------- uniform GPUC3_Mask;
| GPUCompute 4 | uniform _out_; (if we're specific, then from _out_ we want `W` and `dW`, but not `dOmega`)
| in: P x 2    |
----------------
            ↓
---------------- uniform _out_; (if we're specific, then from _out_ we want `lambda` and `sCorr`)
| GPUCompute 5 | 
| in: P        |
----------------
            ↓
assign x* ←— _out_
for a number of iterations, go back to `GPUCompute 3`
then
            ↓
---------------- uniform GPUC6_Mask;
| GPUCompute 6 | uniform W;
| in: P x 2    | uniform dW;
---------------- uniform N_v;
                 uniform dOmega;
            ↓
assign v ←— (1/∆t)(x* - x) + out[1] + out[2]
assign x ←— x*

One big point to consider is the indexing of these uniforms passed to the shaders. What we'll do is pass them in as
varyings, such that the shader program will only be exposed to a float, or a list of floats (likely done through
Uniform Buffer Objects) for a particle's neighbours. Then, the shader will output 4 unsigned bytes (8 bits each, 0 - 255) 
for RGBA- since that's the only supported option to read from with `.readPixels()`- which will then be interpreted 
by the JavaScript/next shader by concatenating them together and casting it to a 32-bit float. This means that the 
shader will only be working on one number at a time, and all input sizes above will need to be doubled for both the 
x and y coordinate. To pass in varyings, we have to define attributes on BufferGeometries and have the vertex shader
declare the varyings.
*/
// #endregion

// order: x1, y1, x2, y2
const lineBounds = [
  [-20, -20, 20, -20],
  [-20, -20, -20, 200],
  [20, -20, 20, 200],
];

const particleRenderer = new ParticleRender(container, N_PARTICLES);

const PIXEL_SCALE = particleRenderer.params.PIXEL_SCALE;
const lineMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff });
const linePoints = [];
linePoints.push(new THREE.Vector3(-20 * PIXEL_SCALE, 100 * PIXEL_SCALE, 0));
linePoints.push(new THREE.Vector3(-20 * PIXEL_SCALE, -20 * PIXEL_SCALE, 0));
linePoints.push(new THREE.Vector3(20 * PIXEL_SCALE, -20 * PIXEL_SCALE, 0));
linePoints.push(new THREE.Vector3(20 * PIXEL_SCALE, 100 * PIXEL_SCALE, 0));
const linesGeometry = new THREE.BufferGeometry().setFromPoints(linePoints);
const line = new THREE.Line(linesGeometry, lineMaterial);
particleRenderer.scene.add(line);

const sim = new Algorithm(particleRenderer.renderer, { SOLVER_ITERATIONS: 10 });
sim.init(N_PARTICLES, MAX_NEIGHBOURS, lineBounds);
// sim.step(0.0166);
particleRenderer.setParticlePositions(sim.positions!);
particleRenderer.render();

let debug = false;
let paused = true;
function render() {
  sim.debug = debug;
  sim.step(paused ? 0.0166 : undefined);

  particleRenderer.setParticlePositions(sim.positions!);
  particleRenderer.render();

  debug = false;
  if (!paused) requestAnimationFrame(render);
}

////////////////////// SIMULATION CONTROLS

const nextFrameBtn = document.querySelector<HTMLButtonElement>("#next-frame")!;
const startStopBtn = document.querySelector("#start-stop")!;
const resetBtn = document.querySelector("#reset")!;
const debugBtn = document.querySelector("#debug")!;
nextFrameBtn.addEventListener("click", () => {
  requestAnimationFrame(render);
});
debugBtn.addEventListener("click", () => {
  debug = true;
  requestAnimationFrame(render);
});
startStopBtn.addEventListener("click", () => {
  paused = !paused;
  nextFrameBtn.disabled = !paused;
  if (paused) sim.pause();
  else requestAnimationFrame(render);
});
resetBtn.addEventListener("click", () => {
  sim.init(N_PARTICLES, MAX_NEIGHBOURS);
  particleRenderer.setParticlePositions(sim.positions!);
  particleRenderer.render();
});

function makeParameterSlider(
  paramName: string,
  glslName: string,
  depends: number[]
) {
  const input = document.querySelector(`#${paramName}`)!;
  const inputEl = input.querySelector("input")!;
  const inputValueDisplay = input.querySelector("span")!;
  inputEl.value = String(eval(`sim.params.${paramName}`));
  inputValueDisplay.textContent = inputEl.value;
  inputEl.addEventListener("input", (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    inputValueDisplay.textContent = event.target.value;
    let value = Number.parseFloat(event.target.value);
    eval(`sim.params.${paramName} = value;`);
    depends.forEach((depend) =>
      sim.gpuComputes[depend].updateUniform(glslName, value)
    );
  });
}
const params: [string, string, number[]][] = [
  ["GRAVITY", "", []],
  ["KERNEL_WIDTH", "h", [3, 4, 6]],
  ["REST_DENSITY", "restDensity", [4, 5]],
  ["ARTIFICIAL_PRESSURE_SCALE", "APk", [4]],
  ["ARTIFICIAL_PRESSURE_FIXED_KERNEL_DISTANCE", "APdeltaQ", [4]],
  ["ARTIFICIAL_PRESSURE_POWER", "APn", [4]],
  ["VORTICITY_COEFFICIENT", "vorticityCoefficient", [6]],
  ["VISCOSITY_COEFFICIENT", "viscosityCoefficient", [6]],
  ["CONSTRAINT_RELAXATION", "constraintRelaxation", [4]],
];
params.forEach(([paramName, glslName, depends]) =>
  makeParameterSlider(paramName, glslName, depends)
);
