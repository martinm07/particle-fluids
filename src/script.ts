import * as THREE from "three";

import { GPUCompute } from "./GPUCompute";
import {
  getSizeXY,
  floatToBytesArray,
  bytesToFloat,
  initTexture,
  createTextureReference,
  initMask,
} from "./helper";

import vertexShaderCode from "./shaders/vertex-shader.glsl";
import fragmentShaderCode from "./shaders/fragment-shader.glsl";
import computeShader1Code from "./shaders/compute-shader-1.glsl";

const N_PARTICLES = 16 ** 2;
const P = 2 * N_PARTICLES;

let posTexWidth: number, posTexHeight: number;
[posTexWidth, posTexHeight] = getSizeXY(P);

const container = document.querySelector<HTMLDivElement>("#scene-container")!;
const WIDTH = container.clientWidth;
const HEIGHT = container.clientHeight;
const aspect = WIDTH / HEIGHT,
  frustumSize = 200;

let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let camera: THREE.OrthographicCamera;
let particleUniforms: { [key: string]: any };

class ParticleGeometry extends THREE.BufferGeometry {
  constructor() {
    super();

    const segments = 20;
    const points = N_PARTICLES * (segments + 2); // +1 for center vertex, and another
    //                                              +1 for inclusive range starting at 0; [0, segments]

    const vertex = new THREE.Vector3(); // helper variable

    const vertices = new THREE.BufferAttribute(new Float32Array(points * 3), 3);
    const referencesX = new THREE.BufferAttribute(
      new Float32Array(points * 2),
      2
    );
    const referencesY = new THREE.BufferAttribute(
      new Float32Array(points * 2),
      2
    );
    const indices = [];

    let v = 0;
    function verts_push(...args: number[]) {
      for (let i = 0; i < args.length; i++) vertices.set([args[i]], v++);
    }

    for (let i = 0; i < N_PARTICLES; i++) {
      verts_push(0, 0, 0);
      for (let s = 0; s <= segments; s++) {
        const segment = (s / segments) * 2 * Math.PI;
        vertex.x = Math.cos(segment);
        vertex.y = Math.sin(segment);
        verts_push(vertex.x, vertex.y, vertex.z);
        const particleIndex = i * (segments + 1) + i;
        if (s > 0)
          indices.push(particleIndex + s, particleIndex + s + 1, particleIndex);
      }
    }
    for (let v = 0; v < points; v++) {
      // for each of the vertices constructing a circle, set all of them
      //  referring to the same particle in the output gpuCompute texture,
      //  noting that when reading the texture image- in a 1D, sequential
      //  fashion (row by row, left to right)- every index is a particle's
      //  x coord, and every other index is a y coord.
      const particleIndex = Math.trunc(v / (points / N_PARTICLES));
      const refXx = ((particleIndex * 2) % posTexWidth) / posTexWidth;
      const refXy =
        Math.trunc((particleIndex * 2) / posTexHeight) / posTexHeight;
      const refYx = ((particleIndex * 2 + 1) % posTexWidth) / posTexWidth;
      const refYy =
        Math.trunc((particleIndex * 2 + 1) / posTexHeight) / posTexHeight;

      referencesX.set([refXx, refXy], v * 2);
      referencesY.set([refYx, refYy], v * 2);
    }

    this.setIndex(indices);
    this.setAttribute("position", vertices);
    this.setAttribute("referenceX", referencesX);
    this.setAttribute("referenceY", referencesY);
    // optional
    this.attributes.referenceX.name = "referenceX";
    this.attributes.referenceY.name = "referenceY";
    this.attributes.position.name = "position";
  }
}

let geometry: ParticleGeometry;
function initParticleRenders() {
  particleUniforms = {
    color: { value: new THREE.Color(0x0000ff) },
    texturePosition: { value: null },
  };
  const material = new THREE.ShaderMaterial({
    uniforms: particleUniforms,
    vertexShader: vertexShaderCode,
    fragmentShader: fragmentShaderCode,
    side: THREE.DoubleSide,
  });
  geometry = new ParticleGeometry();

  const particleMesh = new THREE.Mesh(geometry, material);
  particleMesh.matrixAutoUpdate = false;
  particleMesh.updateMatrix();
  scene.add(particleMesh);
}

function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(WIDTH, HEIGHT);
  renderer.setClearColor(0xdddddd, 1);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  initGPUComputes();

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);

  camera = new THREE.OrthographicCamera(
    (frustumSize * aspect) / -2,
    (frustumSize * aspect) / 2,
    frustumSize / 2,
    frustumSize / -2
  );
  camera.position.z = 1;
  scene.add(camera);

  initParticleRenders();

  // Marker of coord (-75, -75) for testing purposes
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff });
  const linePoints = [];
  linePoints.push(new THREE.Vector3(-85, -75, 0));
  linePoints.push(new THREE.Vector3(-65, -75, 0));
  linePoints.push(new THREE.Vector3(-75, -85, 0));
  linePoints.push(new THREE.Vector3(-75, -65, 0));
  const linesGeometry = new THREE.BufferGeometry().setFromPoints(linePoints);
  const line = new THREE.Line(linesGeometry, lineMaterial);
  scene.add(line);
}

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

function initPositions(): THREE.DataTexture {
  const texture = initTexture(P);
  texture.needsUpdate = true;
  const theArray = texture.image.data;
  for (let i = 0, il = theArray.length; i < il / 4; i++) {
    let num: number;
    if (i % 2 === 0) {
      // x coordinate
      num = (i % 20) * Math.sqrt(3) - 20;
    } else {
      // y coordinate
      num = Math.floor(i / 20) * 3 + 10;
    }
    theArray.set(floatToBytesArray(num), i * 4);
  }
  return texture;
}

const gpuComputes: GPUCompute[] = Array(7);
let positions: THREE.DataTexture;
let velocities: THREE.DataTexture;

function initGPUComputes() {
  positions = initPositions();
  velocities = initTexture(P);

  gpuComputes[1] = new GPUCompute(P * 2, computeShader1Code, renderer, [
    {
      name: "forcesTexture",
      texture: initTexture(P),
    },
    {
      name: "positionsTexture",
      texture: positions,
    },
    {
      name: "velocitiesTexture",
      texture: velocities,
    },
    {
      name: "pReference",
      itemSize: 2,
      data: createTextureReference(P * 2, P),
    },
    {
      name: "GPUC1_Mask",
      texture: initMask(P, 2),
    },
  ]);
  console.log(gpuComputes[1]);
}

let last = performance.now();
let first = true;
function render() {
  const now = performance.now();
  let delta = (now - last) / 1000;
  if (delta > 1) delta = 1; // Cut off for large delta values (experiment with number in future)
  last = now;

  requestAnimationFrame(render);

  gpuComputes.forEach((gpuc) => gpuc.updateUniform("deltaT", delta));
  gpuComputes[1].compute();

  particleUniforms["texturePosition"].value = positions;
  if (first) {
    const pixelBuffer = new Uint8Array(32 * 32 * 4);
    renderer.readRenderTargetPixels(
      gpuComputes[1].renderTarget,
      0,
      0,
      32,
      32,
      pixelBuffer
    );
    // prettier-ignore
    const pixelBufferFloats = Array(...pixelBuffer).map((_el, i) =>
      i % 4 === 0 ? bytesToFloat(pixelBuffer.slice(i, i + 4)) : 0
    ).filter((_el, i) => i % 4 === 0);
    console.log(pixelBufferFloats);
  }

  renderer.render(scene, camera);
  if (first) first = false;
}
init();
render();
