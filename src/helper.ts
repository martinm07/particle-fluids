import { DataTexture } from "three";

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
export const getSizeXY = (len: number) => {
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
  for (let i = 1; i <= numParts; i++)
    mask.push(...Array(partLength * 4).fill(i)); // ` * 4` for RGBA
  const data = new Uint8Array(mask);
  const texture = new DataTexture(data, sizeX, sizeY);
  texture.needsUpdate = true;
  return texture;
};
