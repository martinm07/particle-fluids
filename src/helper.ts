import * as THREE from "three";
import { DataTexture, RGBAFormat, RGFormat, RedFormat, FloatType } from "three";
import { GPUCompute } from "./GPUCompute";
import { TestResult } from "./__tests__/Algorithm.test";
import { LineSegmentsReference } from "./boundsHelper";
import { ParticleRender } from "./ParticleRender";

const TOL = import.meta.env.VITE_TOL;

export const bytesToFloat = function (bytes: Uint8Array) {
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
export const isLittleEndianness =
  bytesToFloat(new Uint8Array([0, 0, 224, 191])) === -1.75;

// helper variables
const fArr = new Float32Array(1);
const bArr = new Uint8Array(fArr.buffer);
export function floatToBytesArray(num: number) {
  fArr[0] = num;
  if (isLittleEndianness) return bArr;
  else return Array.from(bArr).reverse();
}

const factors = (number: number) =>
  [...Array(number + 1).keys()].filter((i) => number % i === 0);
export const getSizeXY = (len: number): [sizeX: number, sizeY: number] => {
  let factorsN = factors(len);
  while (factorsN.length > 3) factorsN = factorsN.slice(1, -1);
  return [
    factorsN.length === 3 ? factorsN[1] : factorsN[0],
    factorsN.length === 3 ? factorsN[1] : factorsN[factorsN.length - 1],
  ];
};

export const initTexture = (length: number) => {
  let sizeX, sizeY;
  [sizeX, sizeY] = getSizeXY(length);
  return new DataTexture(new Uint8Array(4 * sizeX * sizeY), sizeX, sizeY);
};
export const createTextureReference = (
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
      for (let i = 0; i < texWidth; i++)
        final.push((i + 0.5) / texWidth, (j + 0.5) / texHeight);

  return new Float32Array(final);
};
export const initMask = (partLength: number, numParts: number) => {
  let sizeX, sizeY;
  [sizeX, sizeY] = getSizeXY(partLength * numParts);
  const mask = [];
  // TODO: Potential for "too many function arguments" in push splat operator
  for (let i = 1; i <= numParts; i++)
    mask.push(...Array(partLength * 4).fill(i)); // ` * 4` for RGBA
  const data = new Uint8Array(mask);
  const texture = new DataTexture(data, sizeX, sizeY);
  texture.needsUpdate = true;
  return texture;
};

export const fillArr = (len: number, num?: number) =>
  new Float32Array(
    Array(len)
      .fill(num)
      .map((el) => el ?? rng() * 10 - 5)
  );

export function fillBytesTexture(
  sizeX: number,
  sizeY: number,
  contents?: number | Float32Array | ((i: number) => number)
): [texture: THREE.Texture, data: Uint8Array] {
  const texture = new DataTexture(
    new Uint8Array(4 * sizeX * sizeY),
    sizeX,
    sizeY
  );
  texture.needsUpdate = true;
  const data = texture.image.data;
  for (let i = 0; i < data.length / 4; i++) {
    if (contents instanceof Float32Array)
      data.set(floatToBytesArray(contents[i]), i * 4);
    else if (typeof contents === "function")
      data.set(floatToBytesArray(contents(i)), i * 4);
    else data.set(floatToBytesArray(contents ?? rng() * 10 - 5), i * 4);
  }
  return [texture, new Uint8Array(data)];
}

/**
 * @param {string} mode - One of "R", "RG" or "RGBA"
 */
export function fillFloatsTexture(
  sizeX: number,
  sizeY: number,
  mode: "R" | "RG" | "RGBA" = "R",
  contents?: number | Float32Array | Function
): [texture: THREE.Texture, data: Float32Array] {
  let format, multiplier;
  if (mode === "RGBA") {
    format = RGBAFormat;
    multiplier = 4;
  } else if (mode === "RG") {
    format = RGFormat;
    multiplier = 2;
  } else if (mode === "R") {
    format = RedFormat;
    multiplier = 1;
  } else throw new Error("unrecognized value for `mode`. Got: " + mode);
  const texture = new DataTexture(
    new Float32Array(multiplier * sizeX * sizeY),
    sizeX,
    sizeY,
    format,
    FloatType
  );
  texture.needsUpdate = true;
  const data = texture.image.data;
  for (let i = 0; i < data.length; i++) {
    if (contents instanceof Float32Array) data.set([contents[i]], i);
    else if (typeof contents === "function") data.set([contents(i)], i);
    else data.set([contents ?? rng() * 10 - 5], i);
  }
  return [texture, new Float32Array(data)];
}

export function computeAndRead(gpuc: GPUCompute): Float32Array;
// prettier-ignore
export function computeAndRead(gpuc: GPUCompute, convertToFloats: true): Float32Array;
// prettier-ignore
export function computeAndRead(gpuc: GPUCompute, convertToFloats: false): Uint8Array;

export function computeAndRead(gpuc: GPUCompute, convertToFloats?: boolean) {
  convertToFloats ??= true;
  gpuc.compute();
  const pixelBuffer = new Uint8Array(gpuc.sizeX * gpuc.sizeY * 4);
  gpuc.renderer.readRenderTargetPixels(
    gpuc.renderTarget,
    0,
    0,
    gpuc.sizeX,
    gpuc.sizeY,
    pixelBuffer
  );
  if (convertToFloats) {
    const pixelBufferFloats = Array(...pixelBuffer)
      .map((_el, i) =>
        i % 4 === 0 ? bytesToFloat(pixelBuffer.slice(i, i + 4)) : 0
      )
      .filter((_el, i) => i % 4 === 0);
    return new Float32Array(pixelBufferFloats);
  } else {
    return pixelBuffer;
  }
}

export function bytesToFloats(arr: Uint8Array) {
  return new Float32Array(
    Array(...arr)
      .map((_, i) => (i % 4 === 0 ? bytesToFloat(arr.slice(i, i + 4)) : 0))
      .filter((_, i) => i % 4 === 0)
  );
}

export type TypedArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array;

export function formatNumber(val: string | number): string {
  return (typeof val === "string" ? parseFloat(val) : val)
    .toFixed(5)
    .replace(/\.?0+$/g, "");
}

function adjustTOL(expected: number): number {
  // TODO: potentially make TOL smaller if the first significant digit is in the decimals
  //        e.g. 0.004213, TOL: 0.00001 -> 0.0000001
  return TOL * 10 ** String(expected).split(".")[0].length;
}
export function expectToEqual(
  out: TypedArray,
  expected: TypedArray,
  currentResult?: TestResult
): TestResult {
  const result: TestResult = [
    out.every((el, i) => Math.abs(el - expected[i]) < adjustTOL(el)),
  ];
  const printErrors = () => {
    let final = "";
    out.forEach((el, i) => {
      if (
        Math.abs(el - expected[i]) >= adjustTOL(el) ||
        isNaN(el) ||
        isNaN(expected[i])
      ) {
        final += `(${i})${formatNumber(el)}!=${formatNumber(expected[i])}   `;
      }
    });
    return final.trim();
  };
  return [
    (currentResult?.[0] ?? true) && result[0],
    currentResult?.[1] ?? (result[0] ? null : printErrors()),
  ];
}

export function texCoords(sizeX: number, sizeY: number, i: number) {
  return [((i % sizeX) + 0.5) / sizeX, (Math.trunc(i / sizeX) + 0.5) / sizeY];
}

export function randIndices(sourceLen: number, blacklist?: number[]): number;
export function randIndices(
  sourceLen: number,
  blacklist: number[],
  choose: number
): number[];
export function randIndices(
  sourceLen: number,
  blacklist: number[] = [],
  choose?: number
): number | number[] {
  const choices: number[] = [];
  for (let _ = 0; _ < (choose ?? 1); _++) {
    while (true) {
      const choice = Math.floor(rng() * sourceLen);
      if (!choices.includes(choice) && !blacklist.includes(choice)) {
        choices.push(choice);
        break;
      }
    }
  }
  return choose ? choices : choices[0];
}

// https://stackoverflow.com/a/47593316/11493659
function cyrb128(
  str: string
): [h1: number, h2: number, h3: number, h4: number] {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  (h1 ^= h2 ^ h3 ^ h4), (h2 ^= h1), (h3 ^= h1), (h4 ^= h1);
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

function sfc32(a: number, b: number, c: number, d: number) {
  return function () {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

const seed = cyrb128("apples");
const rng = sfc32(...seed);
export { rng };

export type Vec2 = [x: number, y: number];
export type Triangle = [
  v1x: number,
  v1y: number,
  v2x: number,
  v2y: number,
  v3x: number,
  v3y: number
];
export type SolidObjs = Triangle[];
export type Segment = [vix: number, viy: number, vjx: number, vjy: number];

export function trianglesEqual(tri1: Triangle, tri2: Triangle) {
  if (tri1[0] === tri2[0] && tri1[1] === tri2[1]) {
    if (tri1[2] === tri2[2] && tri1[3] === tri2[3]) {
      if (tri1[4] === tri2[4] && tri1[5] === tri2[5]) return true;
    } else if (tri1[2] === tri2[4] && tri1[3] === tri2[5]) {
      if (tri1[4] === tri2[2] && tri1[5] === tri2[3]) return true;
    } else return false;
  } else if (tri1[0] === tri2[2] && tri1[1] === tri2[3]) {
    if (tri1[2] === tri2[0] && tri1[3] === tri2[1]) {
      if (tri1[4] === tri2[4] && tri1[5] === tri2[5]) return true;
    } else if (tri1[2] === tri2[4] && tri1[3] === tri2[5]) {
      if (tri1[4] === tri2[0] && tri1[5] === tri2[1]) return true;
    } else return false;
  } else if (tri1[0] === tri2[4] && tri1[1] === tri2[5]) {
    if (tri1[2] === tri2[0] && tri1[3] === tri2[1]) {
      if (tri1[4] === tri2[2] && tri1[5] === tri2[3]) return true;
    } else if (tri1[2] === tri2[2] && tri1[3] === tri2[3]) {
      if (tri1[4] === tri2[0] && tri1[5] === tri2[1]) return true;
    } else return false;
  } else return false;
}

export function fTrianglesEqual(tri1: Triangle, tri2: Triangle) {
  if (fEq(tri1[0], tri2[0]) && fEq(tri1[1], tri2[1])) {
    if (fEq(tri1[2], tri2[2]) && fEq(tri1[3], tri2[3])) {
      if (fEq(tri1[4], tri2[4]) && fEq(tri1[5], tri2[5])) return true;
    } else if (fEq(tri1[2], tri2[4]) && fEq(tri1[3], tri2[5])) {
      if (fEq(tri1[4], tri2[2]) && fEq(tri1[5], tri2[3])) return true;
    } else return false;
  } else if (fEq(tri1[0], tri2[2]) && fEq(tri1[1], tri2[3])) {
    if (fEq(tri1[2], tri2[0]) && fEq(tri1[3], tri2[1])) {
      if (fEq(tri1[4], tri2[4]) && fEq(tri1[5], tri2[5])) return true;
    } else if (fEq(tri1[2], tri2[4]) && fEq(tri1[3], tri2[5])) {
      if (fEq(tri1[4], tri2[0]) && fEq(tri1[5], tri2[1])) return true;
    } else return false;
  } else if (fEq(tri1[0], tri2[4]) && fEq(tri1[1], tri2[5])) {
    if (fEq(tri1[2], tri2[0]) && fEq(tri1[3], tri2[1])) {
      if (fEq(tri1[4], tri2[2]) && fEq(tri1[5], tri2[3])) return true;
    } else if (fEq(tri1[2], tri2[2]) && fEq(tri1[3], tri2[3])) {
      if (fEq(tri1[4], tri2[0]) && fEq(tri1[5], tri2[1])) return true;
    } else return false;
  } else return false;
}

export function visualiseTexture(
  canvasContainer: HTMLElement,
  generateTex: (
    renderer: THREE.WebGLRenderer
  ) => [t: THREE.Texture, w: number, h: number],
  shader: string
) {
  const renderer = new THREE.WebGLRenderer();
  canvasContainer.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera();
  camera.position.z = 1;
  scene.add(camera);

  const matUniforms: { [key: string]: { value: any } } = {
    tex: { value: null },
  };
  const material = new THREE.ShaderMaterial({
    uniforms: matUniforms,
    vertexShader: passThruVertexShader,
    fragmentShader: shader,
    side: THREE.DoubleSide,
  });

  const geometry = new THREE.PlaneGeometry(2, 2);
  const mesh = new THREE.Mesh(geometry, material);

  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  scene.add(mesh);

  ///////////

  const [tex, width, height] = generateTex(renderer);
  matUniforms["tex"].value = tex;

  //////////

  // prettier-ignore
  material.defines!.resolution = `vec2(${width.toFixed(1)}, ${height.toFixed(1)})`;
  renderer.setSize(width, height, false);

  const render = () => {
    renderer.render(scene, camera);
    requestAnimationFrame(render);
  };
  render();
}

const passThruVertexShader = `
uniform sampler2D input_;

void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
  `;

export function generateRandomInds(length: number): number[] {
  let inds: number[] = Array.from(Array(length), (_, i) => i);
  const newInds: number[] = [];
  for (let i = 0; i < length; i++) {
    const ind = Math.floor(Math.random() * (length - i));
    newInds.push(inds[ind]);
    inds.splice(ind, 1);
  }
  return newInds;
}

export function permute<T>(arr: T[], inds: number[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < inds.length; i++) out.push(arr[inds[i]]);
  return out;
}

export type Transformation = [
  iHatX: number,
  jHatX: number,
  iHatY: number,
  jHatY: number
];

export function applyTransform(matrix: Transformation, v: Vec2): Vec2 {
  return [
    matrix[0] * v[0] + matrix[1] * v[1],
    matrix[2] * v[0] + matrix[3] * v[1],
  ];
}

export function inverseTransform(matrix: Transformation): Transformation {
  const determinantReciprocal =
    1 / (matrix[0] * matrix[3] - matrix[1] * matrix[2]);
  const invMat: Transformation = [matrix[3], -matrix[1], -matrix[2], matrix[0]];
  return <Transformation>invMat.map((el) => determinantReciprocal * el);
}

export const lEq = (l1: unknown[], l2: unknown[]) =>
  l1.every((el, i) => el === l2[i]);
export const fEq = (f1: number, f2: number) => Math.abs(f1 - f2) < 0.000001;

// IMP: Doesn't account for multiple fluidVisuals, nor their individual transform/translates
export function visualiseBounds(
  particleRenderer: ParticleRender,
  lineSegments: Segment[] | LineSegmentsReference,
  scale?: number
) {
  if (lineSegments.length !== 9) console.log(lineSegments);
  const SCALE = scale ? scale : particleRenderer.scale;
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff });

  let segments: Segment[];
  if (((o: any): o is Segment[] => typeof o[0][0] === "number")(lineSegments))
    segments = lineSegments;
  else segments = lineSegments.flat();

  const lines: THREE.Line[] = [];
  const addLine = (seg: Segment) => {
    const linesGeometry = new THREE.BufferGeometry();
    // prettier-ignore
    const positions = new Float32Array([
      seg[0] * SCALE, seg[1] * SCALE, -1,
      seg[2] * SCALE, seg[3] * SCALE, -1,
    ]);
    linesGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );

    const line = new THREE.Line(linesGeometry, lineMaterial);
    particleRenderer.scene.add(line);
    lines.push(line);
  };

  for (const seg of segments) addLine(seg);

  // Update the bounds viz
  return (newSegments: Segment[] | LineSegmentsReference) => {
    let segments: Segment[];
    if (((o: any): o is Segment[] => typeof o[0][0] === "number")(newSegments))
      segments = newSegments;
    else segments = newSegments.flat();

    // if (segments.length !== lines.length)
    //   console.log(lineSegments, newSegments);
    // if (segments.length !== 4) console.log(newSegments);

    const numReusedLines = Math.min(segments.length, lines.length);
    let i;
    for (i = 0; i < numReusedLines; i++) {
      const seg = segments[i];
      const positionAttribute = lines[i].geometry.getAttribute("position");
      positionAttribute.setXYZ(0, seg[0] * SCALE, seg[1] * SCALE, -1);
      positionAttribute.setXYZ(1, seg[2] * SCALE, seg[3] * SCALE, -1);
      positionAttribute.needsUpdate = true;

      if (lines[i].parent !== particleRenderer.scene)
        particleRenderer.scene.add(lines[i]);
    }

    for (i; i < segments.length; i++) {
      const seg = segments[i];
      addLine(seg);
    }

    for (i; i < lines.length; i++) {
      particleRenderer.scene.remove(lines[i]);
    }
  };
}

export function isValid(n?: number) {
  return n !== undefined && n !== null && isFinite(n) && !isNaN(n);
}
