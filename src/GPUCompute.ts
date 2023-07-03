import * as THREE from "three";
import { getSizeXY } from "./helper";

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

export class GPUCompute {
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
  renderer: THREE.WebGLRenderer;

  constructor(
    numComputes: number,
    computeShader: string,
    renderer: THREE.WebGLRenderer,
    inputs: Array<GPUComputeInputTexture | GPUComputeInputVarying>
  ) {
    this.renderer = renderer;
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
  }
  compute() {
    const currentRenderTarget = this.renderer.getRenderTarget();

    const currentXrEnabled = this.renderer.xr.enabled;
    const currentShadowAutoUpdate = this.renderer.shadowMap.autoUpdate;
    const currentOutputColorSpace = this.renderer.outputColorSpace;
    const currentToneMapping = this.renderer.toneMapping;

    this.renderer.xr.enabled = false; // Avoid camera modification
    this.renderer.shadowMap.autoUpdate = false; // Avoid re-computing shadows
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;

    this.renderer.setRenderTarget(this.renderTarget);
    this.renderer.render(this.scene, this.camera);

    this.renderer.xr.enabled = currentXrEnabled;
    this.renderer.shadowMap.autoUpdate = currentShadowAutoUpdate;
    this.renderer.outputColorSpace = currentOutputColorSpace;
    this.renderer.toneMapping = currentToneMapping;

    this.renderer.setRenderTarget(currentRenderTarget);
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
