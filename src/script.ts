import * as THREE from "three";
import { GPUComputationRenderer } from "three/addons/misc/GPUComputationRenderer.js";

import vertexShaderCode from "./shaders/vertex-shader.glsl";
import fragmentShaderCode from "./shaders/fragment-shader.glsl";
import positionShaderCode from "./shaders/positionComputeShader.glsl";

const N_PARTICLES = 16 ** 2;
const texture_width = Math.trunc(N_PARTICLES ** 0.5);

const container = document.querySelector<HTMLDivElement>("#scene-container")!;
const WIDTH = container.clientWidth;
const HEIGHT = container.clientHeight;
const aspect = WIDTH / HEIGHT,
  frustumSize = 200;
const BOUNDS = 200,
  BOUNDS_HALF = 100;

let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let camera: THREE.OrthographicCamera;
let particleUniforms: { [key: string]: any };

function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(WIDTH, HEIGHT);
  renderer.setClearColor(0xdddddd, 1);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  initComputeRenderer();

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
}

let gpuCompute: GPUComputationRenderer;

/*
Here's a list of "chunks", which must be computed sequentially (one after the other),
 but whose work within can be done in parallel.
=-=-= CHUNK I =-=-=
For every particle:
  - Apply forces (e.g. gravity), then 
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

Chunk III precomputes results that will be used in the rest of the chunks. Everything else needs lists
of these values and so can't be computed before we know all of them, thus pushing us into a...
Chunk IV computes all the λs, before we compute any ∆p. That's because we also need the λs of the particle's 
neighbours. In the meantime we can also precompute s_corr.
Chunk V differs slightly from the original pseudocode algorithm. Rather than computing ALL the ∆ps before updating
the x*s (done because we need neighbouring x*s to be original), we store it in a new variable on the particle, which
we then perform the collision response on. This should be faster, better enforce collision bounds, and have the same
memory efficiency (since we don't need to store ∆p in turn).


*/

interface GPUComputeVariable {
  name: string;
  initialValueTexture: THREE.Texture;
  material: THREE.ShaderMaterial;
  dependencies: GPUComputeVariable[];
  renderTargets: THREE.WebGLRenderTarget[];
  wrapS: number;
  wrapT: number;
  minFilter: number;
  magFilter: number;
}
let positionVariable: GPUComputeVariable;

function fillPositionTexture(texture: THREE.DataTexture) {
  const theArray = texture.image.data;
  for (let k = 0, kl = theArray.length; k < kl; k += 4) {
    const x = Math.random() * BOUNDS - BOUNDS_HALF;
    const y = Math.random() * BOUNDS - BOUNDS_HALF;

    theArray[k + 0] = x;
    theArray[k + 1] = y;
    theArray[k + 2] = 0;
    theArray[k + 3] = 1;
  }
}
function initComputeRenderer() {
  gpuCompute = new GPUComputationRenderer(
    texture_width,
    texture_width,
    renderer
  );

  if (renderer.capabilities.isWebGL2 === false) {
    gpuCompute.setDataType(THREE.HalfFloatType);
  }

  const dtPosition = gpuCompute.createTexture();
  fillPositionTexture(dtPosition);
  positionVariable = gpuCompute.addVariable(
    "texturePosition",
    positionShaderCode,
    dtPosition
  );
  gpuCompute.setVariableDependencies(positionVariable, [positionVariable]);

  const error = gpuCompute.init();

  if (error !== null) {
    console.error(error);
  }
}

class ParticleGeometry extends THREE.BufferGeometry {
  constructor() {
    super();

    const segments = 20;
    const points = N_PARTICLES * (segments + 2); // +1 for center vertex, and another
    //                                              +1 for inclusive range starting at 0; [0, segments]

    const vertex = new THREE.Vector3(); // helper variable

    const vertices = new THREE.BufferAttribute(new Float32Array(points * 3), 3);
    const references = new THREE.BufferAttribute(
      new Float32Array(points * 2),
      2
    );
    const indices = [];
    references.onUploadCallback = () =>
      console.log("uploaded reference!", this.getAttribute("reference"));

    let v = 0;
    function verts_push(...args: number[]) {
      for (let i = 0; i < args.length; i++) {
        // vertices.array[v++] = args[i];
        vertices.set([args[i]], v++);
      }
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
    console.log(indices);
    for (let v = 0; v < points; v++) {
      const particleIndex = Math.trunc(v / (points / N_PARTICLES));
      const x = (particleIndex % texture_width) / texture_width;
      const y = Math.trunc(particleIndex / texture_width) / texture_width;

      references.set([x, y], v * 2);
    }
    // references.set(Array(50).fill(0), 0);

    this.setIndex(indices);
    this.setAttribute("position", vertices);
    this.setAttribute("reference", references);

    this.attributes.reference.name = "reference";
    this.attributes.position.name = "position";
    // `position` works, while `reference` doesn't. No notable differences in their objects.
    console.log(this.getAttribute("reference"));
    console.log(this.getAttribute("position"));
  }
}

let geometry: ParticleGeometry;
function initParticleRenders() {
  // const geometry = new THREE.CircleGeometry(1);
  // const material = new THREE.MeshBasicMaterial({ color: 0x0095dd });
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

let start = performance.now();
function render() {
  const now = performance.now();
  requestAnimationFrame(render);

  gpuCompute.compute();

  particleUniforms["texturePosition"].value =
    gpuCompute.getCurrentRenderTarget(positionVariable).texture;
  if (now - start < 200) {
    console.log(particleUniforms["texturePosition"].value);
  }
  // renderer.readRenderTargetPixels(particleUniforms["texturePosition"].value)

  renderer.render(scene, camera);
}
init();
render();
