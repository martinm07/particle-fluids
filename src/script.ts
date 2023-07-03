import * as THREE from "three";

import vertexShaderCode from "./shaders/vertex-shader.glsl";
import fragmentShaderCode from "./shaders/fragment-shader.glsl";
// import positionShaderCode from "./shaders/positionComputeShader.glsl";
import computeShader1Code from "./shaders/compute-shader-1.glsl";

const N_PARTICLES = 16 ** 2;
const P = 2 * N_PARTICLES;

const bytesToFloat = function (bytes: Uint8Array) {
  if (bytes.length !== 4) throw new Error("`bytes` array not of length 4.");
  const buf = new ArrayBuffer(4);
  const float = new Float32Array(buf);
  const uint = new Uint8Array(buf);
  bytes.forEach((byte, i) => (uint[i] = byte));
  try {
    // we expect the input to always be in little-endian order, even if
    //  that's not how the JavaScript is storing it.
    if (isLittleEndianness) bytes.forEach((byte, i) => (uint[i] = byte));
    else bytes.forEach((byte, i) => (uint[3 - i] = byte));
  } catch (error) {
    // isLittleEndianness" is not defined
    bytes.forEach((byte, i) => (uint[i] = byte));
  }
  return float[0];
};
const isLittleEndianness =
  bytesToFloat(new Uint8Array([0, 0, 224, 191])) === -1.75;
console.log(`CPU is ${isLittleEndianness ? "little-endian" : "big-endian"}`);

// helper variables
const fArr = new Float32Array(1);
const bArr = new Uint8Array(fArr.buffer);
function floatToBytesArray(num: number) {
  fArr[0] = num;
  if (isLittleEndianness) return bArr;
  else return Array.from(bArr).reverse();
}

const factors = (number: number) =>
  [...Array(number + 1).keys()].filter((i) => number % i === 0);
const getSizeXY = (len: number) => {
  let factorsN = factors(len);
  while (factorsN.length > 3) factorsN = factorsN.slice(1, -1);
  return [
    factorsN.length === 3 ? factorsN[1] : factorsN[0],
    factorsN.length === 3 ? factorsN[1] : factorsN[factorsN.length - 1],
  ];
};
let posTexWidth: number, posTexHeight: number;
[posTexWidth, posTexHeight] = getSizeXY(P);
console.log(posTexWidth, posTexHeight);

const initTexture = (length: number) => {
  let sizeX, sizeY;
  [sizeX, sizeY] = getSizeXY(length);
  return new THREE.DataTexture(new Uint8Array(4 * sizeX * sizeY), sizeX, sizeY);
};
const createTextureReference = (
  numComputes: number,
  texLength: number
): Float32Array => {
  let texHeight: number, texWidth: number;
  [texWidth, texHeight] = getSizeXY(texLength);

  const canvasMultiple = numComputes / texLength;
  if (canvasMultiple !== Math.floor(canvasMultiple))
    throw new Error("`numComputes` not a multiple of `texLength`");

  // this must match up with the behaviour of gl_FragCoord:
  // https://registry.khronos.org/OpenGL-Refpages/gl4/html/gl_FragCoord.xhtml
  const final = [];
  for (let _ = 0; _ < canvasMultiple; _++)
    for (let j = 0; j < texHeight; j++)
      for (let i = 0; i < texWidth; i++) {
        final.push((i + 0.5) / texWidth, (j + 0.5) / texHeight);
        // final.push(i + 1, j + i * texHeight);
      }

  return new Float32Array(final);
};

const container = document.querySelector<HTMLDivElement>("#scene-container")!;
const WIDTH = container.clientWidth;
const HEIGHT = container.clientHeight;
const aspect = WIDTH / HEIGHT,
  frustumSize = 200;

let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let camera: THREE.OrthographicCamera;
let particleUniforms: { [key: string]: any };

interface GPUComputeInputTexture {
  name: string;
  texture: THREE.DataTexture;
}
interface GPUComputeInputVarying {
  name: string;
  itemSize: number;
  data: Float32Array;
}
interface GPUComputeVarInputs {
  [key: string | symbol]: Float32Array;
}
interface GPUComputeTexInputs {
  [key: string | symbol]: THREE.DataTexture;
}
const gpuComputeInputIsTexture = (
  input: GPUComputeInputTexture | GPUComputeInputVarying
): input is GPUComputeInputTexture => {
  return "texture" in input;
};
const gpuComputeInputIsVarying = (
  input: GPUComputeInputTexture | GPUComputeInputVarying
): input is GPUComputeInputVarying => {
  return "itemSize" in input;
};

class GPUCompute {
  sizeX: number;
  sizeY: number;
  scene: THREE.Scene;
  camera: THREE.Camera;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  renderTarget: THREE.WebGLRenderTarget;
  private _inputs: Array<GPUComputeInputTexture | GPUComputeInputVarying>;
  private _inputIndices: { [key: string | symbol]: number } = {};
  varInputs: GPUComputeVarInputs;
  texInputs: GPUComputeTexInputs;

  constructor(
    numComputes: number,
    computeShader: string,
    inputs: Array<GPUComputeInputTexture | GPUComputeInputVarying>
  ) {
    [this.sizeX, this.sizeY] = getSizeXY(numComputes);

    this._inputs = inputs;
    for (let i = 0; i < inputs.length; i++)
      this._inputIndices[inputs[i].name] = i;
    this.varInputs = new Proxy<GPUComputeVarInputs>(
      {},
      {
        get: (_target, prop) => {
          if (prop in this._inputIndices) {
            const input = this._inputs[this._inputIndices[prop]];
            if (gpuComputeInputIsVarying(input)) return input.data;
          }
        },
        set: (_target, prop, value) => {
          if (!(prop in this._inputIndices)) return false;
          const input = this._inputs[this._inputIndices[prop]];
          if (!gpuComputeInputIsVarying(input)) return false;
          const attrib = this.mesh.geometry.getAttribute("a_" + String(prop));
          if (!(attrib instanceof THREE.BufferAttribute)) return false;
          attrib.set(value);
          attrib.needsUpdate = true;
          input.data = value;
          return true;
        },
      }
    );
    this.texInputs = new Proxy<GPUComputeTexInputs>(
      {},
      {
        get: (_target, prop) => {
          if (prop in this._inputIndices) {
            const input = this._inputs[this._inputIndices[prop]];
            if (gpuComputeInputIsTexture(input)) return input.texture;
          }
        },
        set: (_target, prop, value) => {
          if (!(prop in this._inputIndices)) return false;
          const input = this._inputs[this._inputIndices[prop]];
          if (!gpuComputeInputIsTexture(input)) return false;
          if (!(value instanceof THREE.DataTexture)) return false;
          this.mesh.material.uniforms[String(prop)] = { value };
          this.mesh.material.needsUpdate = true;
          input.texture = value;
          return true;
        },
      }
    );

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera();
    this.mesh = new THREE.Mesh();
    this.renderTarget = new THREE.WebGLRenderTarget();

    this.camera.position.z = 1;

    // Instead of a simple PlaneGeometry made up of two triangles, we want to pass in values
    //  to the fragment shader as varyings, which means that for every call to the fragment
    //  shader there should be a vertex positioned exactly in the center of that fragment/pixel
    //  with the values from attributes, declares, and then copies them into varyings. They need
    //  to be properly positioned so that we don't end up interpolating the values from multiple.
    this.mesh.geometry = new THREE.BufferGeometry();
    // +4 is for four vertices positioned at the corners, (-1, 1), (1, 1), (-1, -1) and (1, -1).
    // These are normalized coordinates to mean that that the geometry will cover the entire canvas,
    //  which we need to do so that it rasterizes the whole canvas and generate calls to the fragment
    //  shader for every pixel along the canvas' height and width.
    // Here's a diagram that visualises the intent: https://imgur.com/a/rZr9jrh
    const vertices = new Float32Array((numComputes + 4) * 3);
    const X = this.sizeX,
      Y = this.sizeY;
    // Ordering it this way means it reads top to bottom, left to right
    const get1DIndex = (i: number, j: number) => i + j * X;
    for (let i = 0; i < X; i++)
      for (let j = 0; j < Y; j++) {
        let fragCenterX = (2 * i) / X + 1 / X - 1;
        let fragCenterY = (2 * j) / Y + 1 / Y - 1;
        // This is to nudge WebGL to which primitive around the vertex the fragment falls in.
        const EPSILON = 0.001;

        const isTop = j === Y - 1;
        const isRight = i === X - 1;
        const isBottom = j === 0;
        const isLeft = i === 0;
        const adjust = (xEpsilon: number, yEpsilon: number) => {
          fragCenterX += xEpsilon;
          fragCenterY += yEpsilon;
        };

        if (isBottom && i === 1) adjust(0.5 * EPSILON, -EPSILON);
        else if (isTop && i === X - 2) adjust(-0.5 * EPSILON, EPSILON);
        else if (isBottom && !isLeft) adjust(EPSILON, -0.5 * EPSILON);
        else if (isTop && !isRight) adjust(-EPSILON, 0.5 * EPSILON);
        else if (isRight || (i === X - 2 && j === Y - 2))
          adjust(EPSILON, EPSILON);
        else adjust(-EPSILON, -EPSILON);

        vertices.set([fragCenterX, fragCenterY, 0], 3 * get1DIndex(i, j));
      }

    // Tesselate the plane with smaller boxes made of two triangles
    const indices: number[] = [];
    for (let i = 0; i < X - 1; i++)
      for (let j = 0; j < Y - 1; j++) {
        const a = get1DIndex(i, j);
        const b = get1DIndex(i + 1, j);
        const c = get1DIndex(i, j + 1);
        const d = get1DIndex(i + 1, j + 1);
        // We want the order to be counter-clockwise when looking at it from the outside
        //  https://stackoverflow.com/a/24592606/11493659

        const isTop = j === Y - 2;
        const isRight = i === X - 2;
        const isBottom = j === 0;
        const isLeft = i === 0;
        // Using the `flat` qualifier for the varyings, we need to make sure the provoking
        //  vertex (i.e. the last vertex) is the one that corresponds with the fragment's vertex
        //  we gave it. This of course depends on the directions we nudge them, above.
        if (isLeft || (!isBottom && !(isTop && isRight))) indices.push(b, c, a);
        else if (isBottom) indices.push(c, a, b);
        else if (isTop && isRight) indices.push(a, b, c);

        if (isRight || (!isTop && !(isBottom && isLeft))) indices.push(c, b, d);
        else if (isTop) indices.push(b, d, c);
        else if (isBottom && isLeft) indices.push(d, c, b);
      }

    vertices.set([-1, 1, 0, 1, 1, 0, -1, -1, 0, 1, -1, 0], 3 * X * Y);
    // the order will be: top-left, top-right, bottom-left, bottom-right
    const corners: number[] = [
      get1DIndex(0, Y - 1),
      get1DIndex(X - 1, Y - 1),
      get1DIndex(0, 0),
      get1DIndex(X - 1, 0),
    ];
    const canvasCorners = [0, 1, 2, 3].map((vi) => vi + X * Y);
    // Create triangles that extend the plane's corners to the canvas corners.
    indices.push(canvasCorners[0], corners[1], canvasCorners[1]);
    indices.push(corners[0], corners[1], canvasCorners[0]);
    indices.push(canvasCorners[1], corners[3], canvasCorners[3]);
    indices.push(corners[1], corners[3], canvasCorners[1]);
    indices.push(canvasCorners[3], corners[2], canvasCorners[2]);
    indices.push(corners[3], corners[2], canvasCorners[3]);
    indices.push(canvasCorners[2], corners[0], canvasCorners[0]);
    indices.push(corners[2], corners[0], canvasCorners[2]);

    this.mesh.geometry.setIndex(indices);
    this.mesh.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(vertices, 3)
    );

    let vertexShader = passThruVertexShader;
    for (const input of inputs)
      if (gpuComputeInputIsVarying(input)) {
        const data = new Float32Array(vertices.length);
        data.set(input.data);
        const expand = (arr: number[]) =>
          arr.map((el) => Array(input.itemSize).fill(el)).flat();
        data.set(expand([0, 0, 0, 0]), input.data.length);
        this.mesh.geometry.setAttribute(
          "a_" + input.name,
          new THREE.BufferAttribute(data, input.itemSize)
        );

        let attribType;
        if (input.itemSize === 1) attribType = "float";
        else if (1 < input.itemSize && input.itemSize < 5)
          attribType = `vec${input.itemSize}`;
        else if (input.itemSize >= 5) attribType = `float[${input.itemSize}]`;

        vertexShader =
          `attribute ${attribType} a_${input.name};\n` + vertexShader;
        vertexShader =
          `flat varying ${attribType} ${input.name};\n` + vertexShader;
        const voidmainMatch = vertexShader
          .matchAll(/void +main\(.*\) *{\s*/g)
          .next().value;
        const index = voidmainMatch.index + voidmainMatch[0].length;
        vertexShader =
          vertexShader.slice(0, index) +
          `${input.name} = a_${input.name};\n    ` +
          vertexShader.slice(index);
      }

    console.log(vertexShader);
    this.mesh.material = new THREE.ShaderMaterial({
      vertexShader: vertexShader,
      fragmentShader: computeShader,
    });
    // prettier-ignore
    this.mesh.material.defines!.resolution = 
      `vec2(${this.sizeX.toFixed(1)}, ${this.sizeY.toFixed(1)})`;
    for (const input of inputs)
      if (gpuComputeInputIsTexture(input)) {
        this.mesh.material.uniforms[input.name] = { value: input.texture };
      }

    this.renderTarget.setSize(this.sizeX, this.sizeY);
    this.renderTarget.depthBuffer = false;
    this.renderTarget.texture.minFilter = THREE.NearestFilter;
    this.renderTarget.texture.magFilter = THREE.NearestFilter;
    this.renderTarget.texture.needsUpdate = true; // just in case...

    this.scene.add(this.mesh);
    // this.compute();
  }
  compute() {
    const currentRenderTarget = renderer.getRenderTarget();

    const currentXrEnabled = renderer.xr.enabled;
    const currentShadowAutoUpdate = renderer.shadowMap.autoUpdate;
    const currentOutputColorSpace = renderer.outputColorSpace;
    const currentToneMapping = renderer.toneMapping;

    renderer.xr.enabled = false; // Avoid camera modification
    renderer.shadowMap.autoUpdate = false; // Avoid re-computing shadows
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;

    renderer.setRenderTarget(this.renderTarget);
    renderer.render(this.scene, this.camera);

    renderer.xr.enabled = currentXrEnabled;
    renderer.shadowMap.autoUpdate = currentShadowAutoUpdate;
    renderer.outputColorSpace = currentOutputColorSpace;
    renderer.toneMapping = currentToneMapping;

    renderer.setRenderTarget(currentRenderTarget);
  }
  updateUniform(name: string, value: any) {
    this.mesh.material.uniforms[name] ??= { value };
    this.mesh.material.uniforms[name].value = value;
  }
}
const passThruVertexShader = `
void main() {
    gl_Position = vec4(position, 1.0);
}
`;

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

// let pReference: Float32Array;
function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(WIDTH, HEIGHT);
  renderer.setClearColor(0xdddddd, 1);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  positions = initPositions();
  velocities = initTexture(P);
  console.log(positions);

  gpuComputes[1] = new GPUCompute(P * 2, computeShader1Code, [
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
      texture: initTexture(P * 2),
    },
  ]);
  // pReference = gpuComputes[1].varInputs.pReference;
  // ` * 4` for RGBA
  gpuComputes[1].texInputs.GPUC1_Mask.image.data.set([
    ...Array(P * 4).fill(1),
    ...Array(P * 4).fill(2),
  ]);
  gpuComputes[1].texInputs.GPUC1_Mask.needsUpdate = true;
  // gpuComputes[1] = new GPUCompute(P, positionShaderCode, [
  //   {
  //     name: "varyingPosition",
  //     itemSize: 1,
  //     data: new Float32Array(2 * N_PARTICLES),
  //   },
  // ]);
  // const arr = new Float32Array(48);
  // arr.set([-75, -75, -75, 75, 30, 20, -10, 75]);
  // arr[16] = 75;
  // arr[17] = -75;
  // gpuComputes[1].inputs.varyingPosition = arr;
  console.log(gpuComputes[1].texInputs.forcesTexture);

  console.log(gpuComputes[1]);

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
  // particleUniforms["texturePosition"].value =
  //   gpuComputes[1].renderTarget.texture;
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

    // Test y (or x) values of pReference for gpuComputes[1]
    // `compute-shader-1.glsl` must set `gl_FragColor = interpretFloat(pReference.y);`
    // const targetArr = pReference.filter((_el, i) => i % 2 === 1); // set `i % 2 === 1` to === 0 for x values
    // const recoveredArr = new Float32Array(targetArr.length);
    // for (let i = 0; i < pixelBuffer.length / 4; i++)
    //   recoveredArr[i] = bytesToFloat(pixelBuffer.slice(i * 4, (i + 1) * 4));

    // for (let i = 0; i < targetArr.length; i++) {
    //   let logOut = `${targetArr[i]} =|= ${recoveredArr[i]}`;
    //   if ((i + 1) % 32 === 0) logOut += " ⤣";
    //   if (targetArr[i] !== recoveredArr[i])
    //     console.log(`${i}: ` + "%c" + logOut, "color: red");
    //   else console.log(`${i}: ` + logOut);
    // }
  }

  renderer.render(scene, camera);
  if (first) first = false;
}
init();
render();
