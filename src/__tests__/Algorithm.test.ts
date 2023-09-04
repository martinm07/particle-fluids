import * as THREE from "three";

import { Algorithm } from "../Algorithm";
import {
  TestResult,
  bytesToFloats,
  computeAndRead,
  expectToEqual,
  fillArr,
  fillBytesTexture,
  fillFloatsTexture,
  getSizeXY,
  randIndices,
  texCoords,
} from "../helper";

let report = "";
let logColors: string[] = [];

function describe(name: string, callback: Function) {
  report = "";
  logColors = [];
  report += `%c${name}%c\n`;
  logColors.push("font-weight: bold; font-size: 130%", "");
  callback();
  console.log(report, ...logColors);
}
function it(description: string, test: () => TestResult) {
  const [success, received] = test();
  logColors.push(`color: ${success ? "green" : "red"}`, "color: default");
  report += `  ...${description} %c${String(
    received ?? (success ? "passed" : "failed")
  )}%c\n`;
}

export function test() {
  describe("GPUCompute 1", testGPUC1);
  describe("GPUCompute 3", testGPUC3);
  describe("GPUCompute 4", testGPUC4);
  describe("GPUCompute 5", testGPUC5);
  describe("GPUCompute 6", testGPUC6);
}

const nParticles = 64;
const P = nParticles * 2;
const maxNeighbours = 50;
const N = nParticles * maxNeighbours * 2;
console.log(`P: ${P}, N: ${N}`);

const renderer = new THREE.WebGLRenderer();
const algorithm = new Algorithm(renderer);

function testGPUC1() {
  it("should not change positions nor velocities in 0 delta time", () => {
    algorithm.init(nParticles, maxNeighbours);

    const gpuc = algorithm.gpuComputes[1];
    gpuc.updateUniform("deltaT", 0);

    let positions: Uint8Array;
    [gpuc.texInputs.positionsTexture, positions] = fillBytesTexture(
      ...getSizeXY(P)
    );

    gpuc.varInputs.force = fillArr(gpuc.length);

    const out = computeAndRead(gpuc, false);
    const expected = new Uint8Array([
      ...fillArr(gpuc.length * 2, 0),
      ...positions,
    ]);
    return expectToEqual(out, expected);
  });

  it("should add forces to velocity in 1 delta time", () => {
    algorithm.init(nParticles, maxNeighbours);

    const gpuc = algorithm.gpuComputes[1];
    gpuc.updateUniform("deltaT", 1);

    let velocityBytes: Uint8Array;
    [gpuc.texInputs.velocitiesTexture, velocityBytes] = fillBytesTexture(
      ...getSizeXY(P)
    );
    const velocity = bytesToFloats(velocityBytes);

    gpuc.varInputs.force = fillArr(gpuc.length);
    const force = gpuc.varInputs.force.slice(0, P);

    const out = computeAndRead(gpuc).slice(0, P);
    const expected = velocity.map((el, i) => el + force[i]);
    return expectToEqual(out, expected);
  });

  it("should add velocity to position in 1 delta time", () => {
    algorithm.init(nParticles, maxNeighbours);

    const gpuc = algorithm.gpuComputes[1];
    gpuc.updateUniform("deltaT", 1);

    let positionBytes: Uint8Array;
    [gpuc.texInputs.positionsTexture, positionBytes] = fillBytesTexture(
      ...getSizeXY(P)
    );
    const positions = bytesToFloats(positionBytes);

    let velocityBytes: Uint8Array;
    [gpuc.texInputs.velocitiesTexture, velocityBytes] = fillBytesTexture(
      ...getSizeXY(P)
    );
    const velocity = bytesToFloats(velocityBytes);

    const out = computeAndRead(gpuc).slice(P);
    const expected = positions.map((el, i) => el + velocity[i]);
    return expectToEqual(out, expected);
  });

  it("should add velocity AND forces to position in 1 delta time", () => {
    algorithm.init(nParticles, maxNeighbours);

    const gpuc = algorithm.gpuComputes[1];
    gpuc.updateUniform("deltaT", 1);

    let positionBytes: Uint8Array;
    [gpuc.texInputs.positionsTexture, positionBytes] = fillBytesTexture(
      ...getSizeXY(P)
    );
    const positions = bytesToFloats(positionBytes);

    let velocityBytes: Uint8Array;
    [gpuc.texInputs.velocitiesTexture, velocityBytes] = fillBytesTexture(
      ...getSizeXY(P)
    );
    const velocity = bytesToFloats(velocityBytes);

    const force = fillArr(P);
    gpuc.varInputs.force = new Float32Array([...force, ...force]);

    const out = computeAndRead(gpuc).slice(P);
    const expected = positions.map((el, i) => el + velocity[i] + force[i]);
    return expectToEqual(out, expected);
  });

  it("should behave as expected for various delta times", () => {
    algorithm.init(nParticles, maxNeighbours);
    const gpuc = algorithm.gpuComputes[1];

    let positionBytes: Uint8Array;
    [gpuc.texInputs.positionsTexture, positionBytes] = fillBytesTexture(
      ...getSizeXY(P)
    );
    const positions = bytesToFloats(positionBytes);

    let velocityBytes: Uint8Array;
    [gpuc.texInputs.velocitiesTexture, velocityBytes] = fillBytesTexture(
      ...getSizeXY(P)
    );
    const velocity = bytesToFloats(velocityBytes);

    const force = fillArr(P);
    gpuc.varInputs.force = new Float32Array([...force, ...force]);

    let result: TestResult = [true];
    for (const deltaT of [0.5, 2.3, -1]) {
      gpuc.updateUniform("deltaT", deltaT);
      const out = computeAndRead(gpuc);
      const expectedVel = velocity.map((el, i) => el + force[i] * deltaT);
      const expectedXStar = positions.map(
        (el, i) => el + velocity[i] * deltaT + force[i] * deltaT ** 2
      );
      result = expectToEqual(
        out,
        new Float32Array([...expectedVel, ...expectedXStar]),
        result
      );
    }

    return result;
  });

  it("should behave as expected for various nParticles", () => {
    let result: TestResult = [true];
    for (const nParticles of [28, 30, 25, 400]) {
      algorithm.init(nParticles, maxNeighbours);
      const gpuc = algorithm.gpuComputes[1];

      gpuc.updateUniform("deltaT", 0.5);
      const P = nParticles * 2;

      let positionBytes: Uint8Array;
      [gpuc.texInputs.positionsTexture, positionBytes] = fillBytesTexture(
        ...getSizeXY(P)
      );
      const positions = bytesToFloats(positionBytes);

      let velocityBytes: Uint8Array;
      [gpuc.texInputs.velocitiesTexture, velocityBytes] = fillBytesTexture(
        ...getSizeXY(P)
      );
      const velocity = bytesToFloats(velocityBytes);

      const force = fillArr(P);
      gpuc.varInputs.force = new Float32Array([...force, ...force]);

      const out = computeAndRead(gpuc);
      const expectedVel = velocity.map((el, i) => el + force[i] * 0.5);
      const expectedXStar = positions.map(
        (el, i) => el + velocity[i] * 0.5 + force[i] * 0.25
      );

      result = expectToEqual(
        out,
        new Float32Array([...expectedVel, ...expectedXStar]),
        result
      );
    }

    return result;
  });
}

function testGPUC3() {
  it("should be 0 at the smoothing kernel radius", () => {
    algorithm.init(nParticles, maxNeighbours);
    const gpuc = algorithm.gpuComputes[3];
    gpuc.updateUniform("h", 3.14);

    const xStarAndVelocity = new Float32Array(P * 2);
    xStarAndVelocity[P + 2] = 3.14;

    [gpuc.texInputs.xStarAndVelocity] = fillBytesTexture(
      ...getSizeXY(P * 2),
      xStarAndVelocity
    );
    const texPCoords = texCoords.bind(null, ...getSizeXY(P * 2));
    gpuc.varInputs.pi_xReference.set(texPCoords(P));
    gpuc.varInputs.pi_yReference.set(texPCoords(P + 1));
    gpuc.varInputs.pj_xReference.set(texPCoords(P + 2));
    gpuc.varInputs.pj_yReference.set(texPCoords(P + 3));

    gpuc.updateVaryings();
    const out = computeAndRead(gpuc).slice(0, 1);
    const expected = new Float32Array(1);
    return expectToEqual(out, expected);
  });

  it("should be 0 beyond the smoothing kernel radius", () => {
    algorithm.init(nParticles, maxNeighbours);
    const gpuc = algorithm.gpuComputes[3];
    gpuc.updateUniform("h", 3.14);

    const xStarAndVelocity = new Float32Array(P * 2);
    xStarAndVelocity[P + 2] = 5;

    [gpuc.texInputs.xStarAndVelocity] = fillBytesTexture(
      ...getSizeXY(P * 2),
      xStarAndVelocity
    );
    const texPCoords = texCoords.bind(null, ...getSizeXY(P * 2));
    gpuc.varInputs.pi_xReference.set(texPCoords(P));
    gpuc.varInputs.pi_yReference.set(texPCoords(P + 1));
    gpuc.varInputs.pj_xReference.set(texPCoords(P + 2));
    gpuc.varInputs.pj_yReference.set(texPCoords(P + 3));

    gpuc.updateVaryings();
    const out = computeAndRead(gpuc).slice(0, 1);
    const expected = new Float32Array(1);
    return expectToEqual(out, expected);
  });

  it("should have a maximum value at 0 distance", () => {
    algorithm.init(nParticles, maxNeighbours);
    const gpuc = algorithm.gpuComputes[3];
    gpuc.updateUniform("h", 3.14);

    const xStarAndVelocity = new Float32Array(P * 2);
    xStarAndVelocity[P + 4] = 0.3;
    xStarAndVelocity[P + 5] = -0.3;
    xStarAndVelocity[P + 8] = -0.2;

    [gpuc.texInputs.xStarAndVelocity] = fillBytesTexture(
      ...getSizeXY(P * 2),
      xStarAndVelocity
    );
    const texPCoords = texCoords.bind(null, ...getSizeXY(P * 2));
    for (let i = 0; i / 2 < 3; i += 2) {
      gpuc.varInputs.pi_xReference.set(texPCoords(P + i * 2), i);
      gpuc.varInputs.pi_yReference.set(texPCoords(P + 1 + i * 2), i);
      gpuc.varInputs.pj_xReference.set(texPCoords(P + 2 + i * 2), i);
      gpuc.varInputs.pj_yReference.set(texPCoords(P + 3 + i * 2), i);
    }

    gpuc.updateVaryings();
    const out = computeAndRead(gpuc);
    return [out[0] > out[1] && out[0] > out[2]];
  });

  it("should have 0 gradient at 0 distance", () => {
    algorithm.init(nParticles, maxNeighbours);
    const gpuc = algorithm.gpuComputes[3];
    gpuc.updateUniform("h", 3.14);

    const xStarAndVelocity = new Float32Array(P * 2);

    [gpuc.texInputs.xStarAndVelocity] = fillBytesTexture(
      ...getSizeXY(P * 2),
      xStarAndVelocity
    );
    const texPCoords = texCoords.bind(null, ...getSizeXY(P * 2));
    for (let k = 1; k <= 2; k++) {
      const maskPartIndex = (k * N) / 4;
      gpuc.varInputs.pi_xReference.set(texPCoords(P), 2 * maskPartIndex);
      gpuc.varInputs.pi_yReference.set(texPCoords(P + 1), 2 * maskPartIndex);
      gpuc.varInputs.pj_xReference.set(texPCoords(P + 2), 2 * maskPartIndex);
      gpuc.varInputs.pj_yReference.set(texPCoords(P + 3), 2 * maskPartIndex);
    }

    gpuc.updateVaryings();
    const out = computeAndRead(gpuc);
    return [out[N / 4] === 0 && out[(2 * N) / 4] === 0];
  });

  it("should be symmetrical around the center", () => {
    algorithm.init(nParticles, maxNeighbours);
    const gpuc = algorithm.gpuComputes[3];
    gpuc.updateUniform("h", 3.14);

    const xStarAndVelocity = new Float32Array(P * 2);
    // all of these have length sqrt(2)
    // gradient should be: [+, +] (pi gets closer to pj by getting bigger)
    xStarAndVelocity[P + 2] = 1;
    xStarAndVelocity[P + 3] = 1;
    // [-, -] i.e. negative
    xStarAndVelocity[P + 4] = 2;
    xStarAndVelocity[P + 5] = 3;
    xStarAndVelocity[P + 6] = 1;
    xStarAndVelocity[P + 7] = 2;
    // [0, -]
    xStarAndVelocity[P + 11] = -Math.sqrt(2);

    [gpuc.texInputs.xStarAndVelocity] = fillBytesTexture(
      ...getSizeXY(P * 2),
      xStarAndVelocity
    );
    const texPCoords = texCoords.bind(null, ...getSizeXY(P * 2));
    for (let k = 0; k <= 2; k++) {
      const mask = (2 * (k * N)) / 4;
      for (let i = 0; i / 2 < 3; i += 2) {
        gpuc.varInputs.pi_xReference.set(texPCoords(P + i * 2), mask + i);
        gpuc.varInputs.pi_yReference.set(texPCoords(P + 1 + i * 2), mask + i);
        gpuc.varInputs.pj_xReference.set(texPCoords(P + 2 + i * 2), mask + i);
        gpuc.varInputs.pj_yReference.set(texPCoords(P + 3 + i * 2), mask + i);
      }
    }

    gpuc.updateVaryings();
    const out = computeAndRead(gpuc);
    const W = out.slice(0, 3);
    const dW_x = out.slice(N / 4, N / 4 + 3);
    const dW_y = out.slice(N / 2, N / 2 + 3);
    const length = (x: number, y: number) => Math.sqrt(x ** 2 + y ** 2);
    let dWLens = Array(3)
      .fill(0)
      .map((_, i) => length(dW_x[i], dW_y[i]));
    let result = expectToEqual(
      new Float32Array([dWLens[0], dWLens[1]]),
      new Float32Array([dWLens[1], dWLens[2]])
    );
    result = expectToEqual(
      new Float32Array([W[0], W[1]]),
      new Float32Array([W[1], W[2]]),
      result
    );
    return result;
  });

  it("should behave as expected for various nParticles", () => {
    let result: TestResult = [true];
    for (const nParticles of [64, 28, 30, 25, 400]) {
      algorithm.init(nParticles, maxNeighbours);
      const gpuc = algorithm.gpuComputes[3];
      const h = 3.14;
      gpuc.updateUniform("h", h);

      const P = nParticles * 2;

      let xStarAndVelocityBytes: Uint8Array;
      [gpuc.texInputs.xStarAndVelocity, xStarAndVelocityBytes] =
        fillBytesTexture(...getSizeXY(P * 2));
      const positions = bytesToFloats(xStarAndVelocityBytes);

      const texPCoords = texCoords.bind(null, ...getSizeXY(P * 2));
      const pijIDs = Array(gpuc.length / 3)
        .fill(0)
        .map(() => randIndices(P / 2, [], 2).map((i) => i + P / 2));

      for (let i = 0; i < gpuc.length; i++) {
        const indices = pijIDs[i % (gpuc.length / 3)]; // 0 -> p_i, 1 -> p_j
        gpuc.varInputs.pi_xReference.set(texPCoords(indices[0] * 2), i * 2);
        gpuc.varInputs.pi_yReference.set(texPCoords(indices[0] * 2 + 1), i * 2);
        gpuc.varInputs.pj_xReference.set(texPCoords(indices[1] * 2), i * 2);
        gpuc.varInputs.pj_yReference.set(texPCoords(indices[1] * 2 + 1), i * 2);
      }

      const length = (x: number, y: number) => Math.sqrt(x ** 2 + y ** 2);
      const W = (r: number) =>
        r < h ? (315 / (64 * Math.PI * h ** 9)) * (h ** 2 - r ** 2) ** 3 : 0;
      const dW = (r: number) =>
        r < h ? (-45 / (Math.PI * h ** 6)) * (h - r) ** 2 : 0;

      const pij: [x: number, y: number][] = pijIDs.map((IDs) => [
        positions[IDs[0] * 2] - positions[IDs[1] * 2],
        positions[IDs[0] * 2 + 1] - positions[IDs[1] * 2 + 1],
      ]);

      const expectedW = pijIDs.map((_, i) => W(length(...pij[i])));
      const EPS = 0.00001;
      const expectedDW_x = pijIDs.map(
        (_, i) =>
          (pij[i][0] / (length(...pij[i]) + EPS)) * dW(length(...pij[i]))
      );
      const expectedDW_y = pijIDs.map(
        (_, i) =>
          (pij[i][1] / (length(...pij[i]) + EPS)) * dW(length(...pij[i]))
      );

      gpuc.updateVaryings();
      const out = computeAndRead(gpuc);
      result = expectToEqual(
        out,
        new Float32Array([...expectedW, ...expectedDW_x, ...expectedDW_y]),
        result
      );
    }
    return result;
  });
}

function testGPUC4() {
  it("should have lambda 0 when particles are at rest density", () => {
    algorithm.init(nParticles, maxNeighbours);
    const gpuc = algorithm.gpuComputes[4];

    const gpuc3Vals = new Float32Array((N / 4) * 3);
    // note this will only access the first element here (with the uninitialized pRefN)
    gpuc3Vals.set(Array(3).fill(1));
    gpuc.updateUniform("restDensity", 3);

    [gpuc.texInputs.GPUC3_Out] = fillBytesTexture(
      ...getSizeXY((N / 4) * 3),
      gpuc3Vals
    );

    gpuc.varInputs.pRefN_Length.set([3]);
    gpuc.updateVaryings();
    const out = computeAndRead(gpuc);
    return expectToEqual(out.slice(0, 1), new Float32Array(1));
  });

  it("should have lambda 1 / ε when particles have 0 neighbours", () => {
    algorithm.init(nParticles, maxNeighbours);
    const gpuc = algorithm.gpuComputes[4];

    gpuc.updateUniform("constraintRelaxation", 1.73);
    const out = computeAndRead(gpuc);
    return expectToEqual(out.slice(0, 1), new Float32Array([1 / 1.73]));
  });

  it("should have lambda 1 / ε when particles have 0 close neighbours", () => {
    algorithm.init(nParticles, maxNeighbours);
    const gpuc = algorithm.gpuComputes[4];

    gpuc.updateUniform("constraintRelaxation", 1.73);
    gpuc.varInputs.pRefN_Length.set([3, 31, 10]);
    gpuc.varInputs.pRefN_startIndex.set([0, 3, 34]);
    gpuc.varInputs.numExtras.set([0, 13, 7]);
    gpuc.updateVaryings();

    const out = computeAndRead(gpuc);
    return expectToEqual(
      out.slice(0, 3),
      new Float32Array(Array(3).fill(1 / 1.73))
    );
  });

  it("should have expected lambda for a GPUC3 texture of all 1s", () => {
    algorithm.init(nParticles, maxNeighbours);
    const gpuc = algorithm.gpuComputes[4];
    gpuc.updateUniform("restDensity", 1);
    gpuc.updateUniform("constraintRelaxation", 0);

    const gpuc3Vals = new Float32Array(Array((N / 4) * 3).fill(1));
    [gpuc.texInputs.GPUC3_Out] = fillBytesTexture(
      ...getSizeXY((N / 4) * 3),
      gpuc3Vals
    );

    const lens = [3, 31, 10];
    gpuc.varInputs.pRefN_Length.set(lens);
    gpuc.updateVaryings();

    const out = computeAndRead(gpuc).slice(0, 3);
    const l2 = (x: number, y: number) => x ** 2 + y ** 2;
    // len * 2 -> len * sqrt((-1)^2 + (-1)^2)^2 = len * (1 + 1)
    const expected = lens.map((len) => -(len - 1) / (l2(len, len) + len * 2));
    return expectToEqual(out, new Float32Array(expected));
  });

  it("should have sCorr be -W(pi - pj) under the select parameter values", () => {
    algorithm.init(nParticles, maxNeighbours);
    const gpuc = algorithm.gpuComputes[4];

    let gpuc3Bytes: Uint8Array;
    [gpuc.texInputs.GPUC3_Out, gpuc3Bytes] = fillBytesTexture(
      ...getSizeXY((N / 4) * 3),
      (i: number) => (i < N / 4 ? Math.random() * 5 : 1)
    );
    const gpuc3Vals = bytesToFloats(gpuc3Bytes);

    gpuc.updateUniform("APk", 1);
    // cube root of 315 / (64 * PI)
    gpuc.updateUniform("h", 1.16143141542);
    gpuc.updateUniform("APdeltaQ", 0);
    gpuc.updateUniform("APn", 1);

    gpuc.varInputs.pRefN_Length.set(Array(gpuc.length).fill(1));
    // will repeat the range of indices [0, P / 2), 3 times.
    gpuc.varInputs.pRefN_startIndex.set(
      Array.from(Array(gpuc.length), (_, i) => i % (P / 2))
    );
    gpuc.updateVaryings();

    const [sizeX, sizeY] = getSizeXY((N / 4) * 3);
    // just return the [GPUC3 coord of the] index at every indexable point of the texture
    [gpuc.texInputs.pRefN] = fillFloatsTexture(
      ...getSizeXY(N / 2),
      "RG",
      (i: number) => texCoords(sizeX, sizeY, Math.floor(i / 2))[i % 2]
    );

    const out = computeAndRead(gpuc).slice(P / 2, P);
    const expected = gpuc3Vals.slice(0, P / 2).map((el) => -el);
    return expectToEqual(out, expected);
  });

  it("should have expected sCorr", () => {
    algorithm.init(nParticles, maxNeighbours);
    const gpuc = algorithm.gpuComputes[4];

    let gpuc3Bytes: Uint8Array;
    [gpuc.texInputs.GPUC3_Out, gpuc3Bytes] = fillBytesTexture(
      ...getSizeXY((N / 4) * 3),
      () => Math.random() * 5
    );
    const gpuc3Vals = bytesToFloats(gpuc3Bytes);

    gpuc.updateUniform("APk", 0.1);
    gpuc.updateUniform("h", 1.32);
    gpuc.updateUniform("APdeltaQ", 0.264);
    gpuc.updateUniform("APn", 4);

    gpuc.varInputs.pRefN_Length.set(Array(gpuc.length).fill(1));
    // will repeat the range of indices [0, P / 2), 3 times.
    gpuc.varInputs.pRefN_startIndex.set(
      Array.from(Array(gpuc.length), (_, i) => i % (P / 2))
    );
    gpuc.updateVaryings();

    const [sizeX, sizeY] = getSizeXY((N / 4) * 3);
    // just return the [GPUC3 coord of the] index at every indexable point of the texture
    [gpuc.texInputs.pRefN] = fillFloatsTexture(
      ...getSizeXY(N / 2),
      "RG",
      (i: number) => texCoords(sizeX, sizeY, Math.floor(i / 2))[i % 2]
    );

    const out = computeAndRead(gpuc).slice(P / 2);
    const qW =
      (315 / (64 * Math.PI * 1.32 ** 9)) * (1.32 ** 2 - 0.264 ** 2) ** 3;
    const expected = Array.from(Array(P), (_, i_: number) => {
      const i = i_ % (P / 2);
      return (
        -0.1 *
        (gpuc3Vals[i] / qW) ** 4 *
        (i_ < P / 2 ? gpuc3Vals[i + N / 4] : gpuc3Vals[i + N / 2])
      );
    });
    return expectToEqual(out, new Float32Array(expected));
  });

  it("should behave as expected for various nParticles", () => {
    let result: TestResult = [true];
    for (const nParticles of [64, 28, 30, 25, 400]) {
      algorithm.init(nParticles, maxNeighbours);
      const gpuc = algorithm.gpuComputes[4];

      const P = nParticles * 2;
      const N = nParticles * maxNeighbours * 2;

      let gpuc3Bytes: Uint8Array;
      [gpuc.texInputs.GPUC3_Out, gpuc3Bytes] = fillBytesTexture(
        ...getSizeXY((N / 4) * 3),
        (i: number) => (i < N / 4 ? Math.random() * 5 : Math.random() * 10 - 5)
      );
      const gpuc3Vals = bytesToFloats(gpuc3Bytes);

      gpuc.updateUniform("restDensity", 0.85);
      gpuc.updateUniform("constraintRelaxation", 2.3);
      gpuc.updateUniform("APk", 0.1);
      gpuc.updateUniform("h", 1.32);
      gpuc.updateUniform("APdeltaQ", 0.264);
      gpuc.updateUniform("APn", 4);

      const NLength = Array.from(Array(P / 2), () =>
        Math.floor(Math.random() * 15)
      );
      const NIndex = Array.from(Array(P / 2), () =>
        Math.floor(Math.random() * 15)
      );
      const NExtras = Array.from(Array(P / 2), (_, i) =>
        Math.floor(Math.random() * gpuc.varInputs.pRefN_Length[i])
      );

      for (let k = 0; k <= 2; k++) {
        gpuc.varInputs.pRefN_Length.set(NLength, (k * P) / 2);
        gpuc.varInputs.pRefN_startIndex.set(NIndex, (k * P) / 2);
        gpuc.varInputs.numExtras.set(NExtras, (k * P) / 2);
      }

      gpuc.updateVaryings();

      const [sizeX, sizeY] = getSizeXY((N / 4) * 3);
      // just return the [GPUC3 coord of the] index at every indexable point of the texture
      [gpuc.texInputs.pRefN] = fillFloatsTexture(
        ...getSizeXY(N / 2),
        "RG",
        (i: number) => texCoords(sizeX, sizeY, Math.floor(i / 2))[i % 2]
      );

      const qW =
        (315 / (64 * Math.PI * 1.32 ** 9)) * (1.32 ** 2 - 0.264 ** 2) ** 3;
      const expectedSCorr = Array.from(Array(P), (_, i_) => {
        const i = i_ % (P / 2);
        let sum = 0;
        for (let j = 0; j < NLength[i]; j++) {
          const dWStart = i_ < P / 2 ? N / 4 : N / 2;
          // 0 | 1 | 2 | 𝟛 | 𝟜 - Length = 5, Extras = 2
          const isExtra = j >= NLength[i] - NExtras[i];
          sum +=
            -0.1 *
            (gpuc3Vals[NIndex[i] + j] / qW) ** 4 *
            (isExtra ? -1 : 1) *
            gpuc3Vals[NIndex[i] + j + dWStart];
        }
        return sum;
      });

      const l2 = (x: number, y: number) => x ** 2 + y ** 2;
      const expectedLambda = Array.from(Array(P / 2), (_, i) => {
        const rD = 1 / 0.85;
        let sumW = 0,
          sumDWX = 0,
          sumDWY = 0,
          sumDW2 = 0;
        for (let j = 0; j < NLength[i]; j++) {
          const isExtra = j >= NLength[i] - NExtras[i];
          sumW += gpuc3Vals[NIndex[i] + j];
          sumDWX += (isExtra ? -1 : 1) * gpuc3Vals[NIndex[i] + j + N / 4];
          sumDWY += (isExtra ? -1 : 1) * gpuc3Vals[NIndex[i] + j + N / 2];
          sumDW2 += l2(
            rD * gpuc3Vals[NIndex[i] + j + N / 4],
            rD * gpuc3Vals[NIndex[i] + j + N / 2]
          );
        }
        return -(rD * sumW - 1) / (l2(rD * sumDWX, rD * sumDWY) + sumDW2 + 2.3);
      });

      const out = computeAndRead(gpuc);
      result = expectToEqual(
        out,
        new Float32Array([...expectedLambda, ...expectedSCorr]),
        result
      );
    }
    return result;
  });
}

function testGPUC5() {
  it("should have Δp 0 for 0 neighbours", () => {
    algorithm.init(nParticles, maxNeighbours);
    const gpuc = algorithm.gpuComputes[5];

    let xStarAndVelocityBytes;
    [gpuc.texInputs.xStarAndVelocity, xStarAndVelocityBytes] = fillBytesTexture(
      ...getSizeXY(P * 2)
    );
    const expected = bytesToFloats(xStarAndVelocityBytes);

    [gpuc.texInputs.GPUC3_Out] = fillBytesTexture(...getSizeXY((N / 4) * 3));
    [gpuc.texInputs.GPUC4_Out] = fillBytesTexture(
      ...getSizeXY((P / 2) * 3),
      (i) => (i < P / 2 ? Math.random() * 5 - 10 : 0)
    );

    const out = computeAndRead(gpuc);
    return expectToEqual(out, expected);
  });

  it("should have a particle's lambda show up j times in its Δp and once in its j neighbours' Δp s", () => {
    algorithm.init(nParticles, maxNeighbours);
    const gpuc = algorithm.gpuComputes[5];
    gpuc.updateUniform("restDensity", 1);

    [gpuc.texInputs.GPUC3_Out] = fillBytesTexture(...getSizeXY((N / 4) * 3), 1);

    const gpuc4Vals = new Float32Array((P / 2) * 3);
    gpuc4Vals[0] = 1;
    [gpuc.texInputs.GPUC4_Out] = fillBytesTexture(
      ...getSizeXY((P / 2) * 3),
      gpuc4Vals
    );

    const pRefPN = new Float32Array(N / 2);
    pRefPN.set([
      ...[1, 3, 10, 34], // 0
      ...[0], // 1
      ...[1, 2, 0], // 3
      ...[9, 11, 32, 34, 0], // 10
      ...[32, 33, 35, 0], // 34
    ]);
    const pRefN_lens = [4, 1, 3, 5, 4];
    const pRefN_starts = [0, 4, 5, 8, 13];
    for (const [i, index] of [0, 1, 3, 10, 34].entries()) {
      // we don't need both the x and y component, thus only x here is set
      gpuc.varInputs.pRefN_Length[P + index * 2] = pRefN_lens[i];
      gpuc.varInputs.pRefN_startIndex[P + index * 2] = pRefN_starts[i];
    }

    [gpuc.texInputs.pRefPN] = fillFloatsTexture(
      ...getSizeXY(N / 2),
      "R",
      pRefPN
    );
    gpuc.updateVaryings();

    const out = computeAndRead(gpuc).slice(P);

    let pass = out[0] === 4;
    for (const index of [1, 3, 10, 34]) {
      pass = pass && out[index * 2] === 1;
    }
    return [pass];
  });

  it("should be a summation of ∇W s under constant lambda and sCorr", () => {
    algorithm.init(nParticles, maxNeighbours);
    const gpuc = algorithm.gpuComputes[5];
    gpuc.updateUniform("restDensity", 1);

    [gpuc.texInputs.GPUC4_Out] = fillBytesTexture(
      ...getSizeXY((P * 3) / 2),
      (i: number) => (i < P / 2 ? 0.5 : 0)
    );
    const lens = Array.from(Array(gpuc.length), () => 1);
    gpuc.varInputs.pRefN_Length.set(lens);
    const starts: number[] = Array(gpuc.length);
    let accumIndex = 0;
    for (let i = 0; i < gpuc.length; i++) {
      if (i % P === 0) accumIndex = 0;
      starts[i] = accumIndex;
      accumIndex += gpuc.varInputs.pRefN_Length[i];
    }
    gpuc.varInputs.pRefN_startIndex.set(starts);
    gpuc.updateVaryings();

    const [sizeX, sizeY] = getSizeXY((N / 4) * 3);
    // just return the [GPUC3 coord of the] index at every indexable point of the texture
    [gpuc.texInputs.pRefN] = fillFloatsTexture(
      ...getSizeXY(N / 2),
      "RG",
      (i: number) => texCoords(sizeX, sizeY, Math.floor(i / 2))[i % 2]
    );

    let GPUC3Bytes;
    [gpuc.texInputs.GPUC3_Out, GPUC3Bytes] = fillBytesTexture(
      ...getSizeXY((N * 3) / 4)
    );
    const gpuc3Vals = bytesToFloats(GPUC3Bytes);

    const out = computeAndRead(gpuc).slice(P);
    const expected = starts.map((start, i) => {
      const mask = i % 2 === 0 ? N / 4 : N / 2;
      return gpuc3Vals
        .slice(mask + start, mask + start + lens[i])
        .reduce((a, c) => a + c, 0);
    });
    return expectToEqual(out, new Float32Array(expected));
  });

  it("should return 1/p0 * sCorr for lambda 0", () => {
    algorithm.init(nParticles, maxNeighbours);
    const gpuc = algorithm.gpuComputes[5];
    gpuc.updateUniform("restDensity", 1.32);

    let gpuc4Bytes;
    [gpuc.texInputs.GPUC4_Out, gpuc4Bytes] = fillBytesTexture(
      ...getSizeXY((P * 3) / 2),
      (i: number) => (i < P / 2 ? 0 : Math.random() * 10 - 5)
    );
    const gpuc4Vals = bytesToFloats(gpuc4Bytes);

    const out = computeAndRead(gpuc).slice(P);
    const expected = Array.from(
      Array(P),
      (_, i) =>
        (gpuc4Vals[(i % 2 === 0 ? P / 2 : P) + Math.floor(i / 2)] * 1) / 1.32
    );
    return expectToEqual(out, new Float32Array(expected));
  });

  it("should stop at expected boundaries for various lineBounds", () => {
    let result: TestResult = [true];
    const tests = [
      {
        lineBounds: [[0, -2, 0, 2]],
        x: [-1, 1],
        xStar: [1, 1],
        expected: [0, 1],
      },
      {
        lineBounds: [[-3, 2, 1, 2]],
        x: [-2, 1],
        xStar: [-2, 4],
        expected: [-2, 2],
      },
      {
        lineBounds: [[-2, -2, 2, 2]],
        x: [-1, 0],
        xStar: [2, 0],
        expected: [0, 0],
      },
      {
        lineBounds: [
          [-5, -1, -2, 4],
          [2, -1, 0, 1],
          [1.5, -2, 1.5, 2],
        ],
        x: [0, 0],
        xStar: [2, 0],
        expected: [1, 0],
      },
      {
        lineBounds: [[-2, -2, -2, 2]],
        x: [-2, -1],
        xStar: [-4, -1],
        expected: [-2, -1],
      },
      {
        lineBounds: [[-2, -2, -2, 2]],
        x: [-2.005, -1],
        xStar: [-4, -1],
        expected: [-4, -1],
      },
    ];
    for (const { lineBounds, x, xStar, expected } of tests) {
      algorithm.init(nParticles, maxNeighbours, lineBounds);
      let gpuc = algorithm.gpuComputes[5];

      const positions = new Float32Array(P);
      positions.set(x);
      [gpuc.texInputs.X] = fillBytesTexture(...getSizeXY(P), positions);

      const xStarAndVelocity = new Float32Array(2 * P);
      xStarAndVelocity.set(xStar, P);
      [gpuc.texInputs.xStarAndVelocity] = fillBytesTexture(
        ...getSizeXY(2 * P),
        xStarAndVelocity
      );

      const out = computeAndRead(gpuc).slice(P);
      const expected_ = new Float32Array(P);
      expected_.set(expected);
      result = expectToEqual(out, expected_, result);
    }
    return result;
  });

  it("should behave as expected for various nParticles", () => {
    let result: TestResult = [true];
    for (const nParticles of [64, 28, 30, 25, 400]) {
      const lineBounds = [[-100, -4, 100, -4]];
      algorithm.init(nParticles, maxNeighbours, lineBounds);
      const gpuc = algorithm.gpuComputes[5];

      const P = 2 * nParticles;
      const N = 2 * nParticles * maxNeighbours;

      let posBytes;
      [gpuc.texInputs.X, posBytes] = fillBytesTexture(...getSizeXY(P));
      const X = bytesToFloats(posBytes);

      let xStarAndVelBytes;
      [gpuc.texInputs.xStarAndVelocity, xStarAndVelBytes] = fillBytesTexture(
        ...getSizeXY(P * 2)
      );
      const xStarAndVel = bytesToFloats(xStarAndVelBytes);

      let c3Bytes, c4Bytes;
      [gpuc.texInputs.GPUC3_Out, c3Bytes] = fillBytesTexture(
        ...getSizeXY((N * 3) / 4)
      );
      const c3Vals = bytesToFloats(c3Bytes);
      [gpuc.texInputs.GPUC4_Out, c4Bytes] = fillBytesTexture(
        ...getSizeXY((P * 3) / 2)
      );
      const c4Vals = bytesToFloats(c4Bytes);

      let lens = Array.from(Array(gpuc.length), (_, i) =>
        i < P ? 0 : Math.floor(Math.random() * 10)
      );
      lens = lens.map((el, i) => (i % 2 === 1 ? lens[i - 1] : el));
      gpuc.varInputs.pRefN_Length.set(lens);

      let starts: number[] = Array(gpuc.length).fill(0);
      let accumIndex = 0;
      for (let i = P; i < gpuc.length; i += 2) {
        starts[i] = accumIndex;
        starts[i + 1] = accumIndex;
        accumIndex += lens[i];
      }
      gpuc.varInputs.pRefN_startIndex.set(starts);

      let extras = Array.from(Array(gpuc.length), (_, i) =>
        i < P ? 0 : Math.floor(Math.random() * lens[i])
      );
      gpuc.varInputs.numExtras.set(extras);

      gpuc.updateVaryings();

      const [sizeX, sizeY] = getSizeXY((N / 4) * 3);
      // just return the [GPUC3 coord of the] index at every indexable point of the texture
      [gpuc.texInputs.pRefN] = fillFloatsTexture(
        ...getSizeXY(N / 2),
        "RG",
        (i: number) => texCoords(sizeX, sizeY, Math.floor(i / 2))[i % 2]
      );

      const pRefPN = new Float32Array(N / 2).map(() => randIndices(P / 2));
      [gpuc.texInputs.pRefPN] = fillFloatsTexture(
        ...getSizeXY(N / 2),
        "R",
        pRefPN
      );

      gpuc.updateUniform("restDensity", 1.32);

      const out = computeAndRead(gpuc);
      const expected = new Float32Array(P).map((_, i_) => {
        const index = Math.floor(i_ / 2);
        const i = i_ + P;

        const lambda_i = c4Vals[index];
        let sum = 0;
        for (let j = 0; j < lens[i]; j++) {
          const lambda_j = c4Vals[pRefPN[starts[i] + j]];
          // [0, 1, 2, 3, 𝟜, 𝟝]
          // len: 6, extras: 2, thus j is an extra when len - extras <= j
          const extra = lens[i] - j <= extras[i] ? -1 : 1;
          const mask = i_ % 2 === 0 ? N / 4 : N / 2;
          sum += (lambda_i + lambda_j) * extra * c3Vals[mask + starts[i] + j];
        }
        const mask = i_ % 2 === 0 ? P / 2 : P;
        const sCorr = c4Vals[mask + index];
        const deltaP = (1 / 1.32) * (sum + sCorr);

        return xStarAndVel[i] + deltaP;
      });
      for (let i = 0; i < P / 2; i++) {
        const xStar = expected[i * 2];
        const yStar = expected[i * 2 + 1];
        const x = X[i * 2];
        const y = X[i * 2 + 1];
        if ((yStar >= -4 && y <= -4) || (yStar <= -4 && y >= -4)) {
          // Since the slope from points x to xStar will be the same as the slope from x to the intersection
          //  (they're both segments of the same line after all), and since our only boundary here happens
          //  to be completely horizontal, we can solve directly for intersection's x-component `x'` in the equation:
          //  (y - y*) / (x - x*) = (y - (-4)) / (x - x')
          expected[i * 2] = x - ((y + 4) * (x - xStar)) / (y - yStar);
          expected[i * 2 + 1] = -4;
        }
      }

      // console.log(out.slice(P), expected);
      result = expectToEqual(
        out,
        new Float32Array([...xStarAndVel.slice(0, P), ...expected]),
        result
      );
    }
    return result;
  });
}

function testGPUC6() {
  it("should be 0 for x* = x", () => {
    algorithm.init(nParticles, maxNeighbours);
    const gpuc = algorithm.gpuComputes[6];

    [gpuc.texInputs.X] = fillBytesTexture(...getSizeXY(P), 2);
    [gpuc.texInputs.xStarAndVelocity] = fillBytesTexture(
      ...getSizeXY(2 * P),
      2
    );

    gpuc.varInputs.pRefN_Length.set(Array(gpuc.length).fill(1));
    gpuc.updateVaryings();

    const out = computeAndRead(gpuc);
    const expected = new Float32Array(gpuc.length);
    return expectToEqual(out, expected);
  });

  it("should be x* - x in 1 deltaTime and no vorticity/viscosity", () => {
    algorithm.init(nParticles, maxNeighbours);
    const gpuc = algorithm.gpuComputes[6];
    gpuc.updateUniform("vorticityCoefficient", 0);
    gpuc.updateUniform("viscosityCoefficient", 0);
    gpuc.updateUniform("deltaT", 1);

    let xStarBytes;
    [gpuc.texInputs.xStarAndVelocity, xStarBytes] = fillBytesTexture(
      ...getSizeXY(2 * P)
    );
    const xStar = bytesToFloats(xStarBytes).slice(P);

    let XBytes;
    [gpuc.texInputs.X, XBytes] = fillBytesTexture(...getSizeXY(P));
    const X = bytesToFloats(XBytes);

    const out = computeAndRead(gpuc);
    const expected = new Float32Array(P).map((_, i) => xStar[i] - X[i]);
    return expectToEqual(out, expected);
  });

  it("should have viscosity be a sum of kernel values for vij = 1", () => {
    algorithm.init(nParticles, maxNeighbours);
    const gpuc = algorithm.gpuComputes[6];
    gpuc.updateUniform("vorticityCoefficient", 0);
    gpuc.updateUniform("viscosityCoefficient", 1);
    gpuc.updateUniform("deltaT", 1);
    const h = 1.32;
    gpuc.updateUniform("h", h);

    let xStarBytes;
    [gpuc.texInputs.xStarAndVelocity, xStarBytes] = fillBytesTexture(
      ...getSizeXY(2 * P)
    );
    const xStar = bytesToFloats(xStarBytes).slice(P);

    // Remember that v_i will be x*_i - x_i, and if we can have v_0 = 1 and the rest equal 0,
    //  then we can make all v_j point to v_0, thus v_ij = v_j - v_i = 1 - 0.
    [gpuc.texInputs.X] = fillBytesTexture(...getSizeXY(P), (i: number) =>
      i < 2 ? xStar[i] - 1 : xStar[i]
    );

    [gpuc.texInputs.pRefPN] = fillFloatsTexture(...getSizeXY(N / 2), "R", 0);

    let lens = Array.from(Array(gpuc.length), () =>
      Math.floor(Math.random() * 10)
    );
    lens = lens.map((len, i) => (i % 2 === 0 ? len : lens[i - 1]));
    gpuc.varInputs.pRefN_Length.set(lens);

    let starts = Array(gpuc.length).fill(0);
    let accumIndex = 0;
    for (let i = 0; i < gpuc.length; i += 2) {
      starts[i] = accumIndex;
      starts[i + 1] = accumIndex;
      accumIndex += lens[i];
    }
    gpuc.varInputs.pRefN_startIndex.set(starts);

    gpuc.updateVaryings();

    // Skip the first one since there v_ij = 0
    const out = computeAndRead(gpuc).slice(1);

    const W = (r: number) =>
      r < h ? (315 / (64 * Math.PI * h ** 9)) * (h ** 2 - r ** 2) ** 3 : 0;
    const expected = new Float32Array(P - 1).map((_, i_) => {
      const i = i_ + 1;

      const viscosity = W(Math.sqrt(2)) * lens[i];
      // Normally, this would be v_i + viscosity, but since v_i = xStar - X
      //  which will equal 0 in all but v_0, we don't have to bother.
      return viscosity;
    });
    return expectToEqual(out, expected);
  });

  it("should have vorticity 0 for ∇W 0", () => {
    algorithm.init(nParticles, maxNeighbours);
    const gpuc = algorithm.gpuComputes[6];
    gpuc.updateUniform("vorticityCoefficient", 1);
    gpuc.updateUniform("viscosityCoefficient", 0);
    gpuc.updateUniform("deltaT", 1);
    gpuc.updateUniform("h", 0.1);

    let xStarBytes;
    [gpuc.texInputs.xStarAndVelocity, xStarBytes] = fillBytesTexture(
      ...getSizeXY(2 * P),
      (i) => i
    );
    const xStar = bytesToFloats(xStarBytes).slice(P);

    [gpuc.texInputs.X] = fillBytesTexture(...getSizeXY(P), (i) => xStar[i]);

    let lens = Array.from(Array(gpuc.length), () =>
      Math.floor(Math.random() * 10)
    );
    lens = lens.map((len, i) => (i % 2 === 0 ? len : lens[i - 1]));
    gpuc.varInputs.pRefN_Length.set(lens);

    let starts = Array(gpuc.length).fill(0);
    let accumIndex = 0;
    for (let i = 0; i < gpuc.length; i += 2) {
      starts[i] = accumIndex;
      starts[i + 1] = accumIndex;
      accumIndex += lens[i];
    }
    gpuc.varInputs.pRefN_startIndex.set(starts);

    // Get random indices for p_i which are NOT p_i
    [gpuc.texInputs.pRefPN] = fillFloatsTexture(
      ...getSizeXY(N / 2),
      "R",
      (i: number) => randIndices(P / 2, [starts.find((el) => i > el) - 1])
    );

    gpuc.updateVaryings();
    const out = computeAndRead(gpuc);
    const expected = new Float32Array(P);
    return expectToEqual(out, expected);
  });

  it("should behave as expected for various nParticles", () => {
    let result: TestResult = [true];
    for (const nParticles of [64, 28, 30, 25, 400]) {
      algorithm.init(nParticles, maxNeighbours);
      const gpuc = algorithm.gpuComputes[6];
      gpuc.updateUniform("vorticityCoefficient", 3.1);
      gpuc.updateUniform("viscosityCoefficient", 2.74);
      const deltaT = 0.8;
      gpuc.updateUniform("deltaT", deltaT);
      const h = 2.74;
      gpuc.updateUniform("h", h);

      const P = 2 * nParticles;
      const N = 2 * nParticles * maxNeighbours;

      let xStarBytes;
      [gpuc.texInputs.xStarAndVelocity, xStarBytes] = fillBytesTexture(
        ...getSizeXY(2 * P)
      );
      const xStar = bytesToFloats(xStarBytes).slice(P);

      let XBytes;
      [gpuc.texInputs.X, XBytes] = fillBytesTexture(...getSizeXY(P));
      const X = bytesToFloats(XBytes);

      let lens = Array.from(Array(gpuc.length), () =>
        Math.floor(Math.random() * 10)
      );
      lens = lens.map((len, i) => (i % 2 === 0 ? len : lens[i - 1]));
      gpuc.varInputs.pRefN_Length.set(lens);

      let starts = Array(gpuc.length).fill(0);
      let accumIndex = 0;
      for (let i = 0; i < gpuc.length; i += 2) {
        starts[i] = accumIndex;
        starts[i + 1] = accumIndex;
        accumIndex += lens[i];
      }
      gpuc.varInputs.pRefN_startIndex.set(starts);

      const extras = Array.from(Array(gpuc.length), (_, i) =>
        Math.floor(Math.random() * lens[i])
      );
      gpuc.varInputs.numExtras.set(extras);

      let pRefPN: Float32Array;
      [gpuc.texInputs.pRefPN, pRefPN] = fillFloatsTexture(
        ...getSizeXY(N / 2),
        "R",
        () => randIndices(P / 2)
      );

      gpuc.updateVaryings();
      const out = computeAndRead(gpuc);

      const length = (x: number, y: number) => Math.sqrt(x ** 2 + y ** 2);
      const W = (r: number) =>
        r < h ? (315 / (64 * Math.PI * h ** 9)) * (h ** 2 - r ** 2) ** 3 : 0;
      const dW = (r: number) =>
        r < h ? (-45 / (Math.PI * h ** 6)) * (h - r) ** 2 : 0;
      const ddW = (r: number) =>
        r < h ? (90 / (Math.PI * h ** 6)) * (h - r) : 0;
      const expected = new Float32Array(P).map((_, i) => {
        const i_x = Math.floor(i / 2);
        const i_y = Math.floor(i / 2) + 1;

        const vi = (1 / deltaT) * (xStar[i] - X[i]);

        let viscosity = 0;
        let vorticity = 0;
        let dVorticity_x = 0;
        let dVorticity_y = 0;
        for (let j_ = 0; j_ < lens[i]; j_++) {
          const j = pRefPN[starts[i] + j_] * 2 + (i % 2);
          const vj = (1 / deltaT) * (xStar[j] - X[j]);

          const j_x = pRefPN[starts[i] + j_] * 2;
          const j_y = pRefPN[starts[i] + j_] * 2 + 1;
          const r = length(xStar[i_x] - xStar[j_x], xStar[i_y] - xStar[j_y]);

          viscosity += (vj - vi) * W(r);
          const vij_x =
            (1 / deltaT) * (xStar[j_x] - X[j_x] - (xStar[i_x] - X[i_x]));
          const vij_y =
            (1 / deltaT) * (xStar[j_y] - X[j_y] - (xStar[i_y] - X[i_y]));
          const dpjW_x = (-(xStar[i_x] - xStar[j_x]) / r) * dW(r);
          const dpjW_y = (-(xStar[i_y] - xStar[j_y]) / r) * dW(r);
          vorticity += vij_x * dpjW_y - vij_y * dpjW_x;

          dVorticity_x += vij_y * ((xStar[i_x] - xStar[j_x]) / r) ** 2 * ddW(r);
          dVorticity_y +=
            -vij_x * ((xStar[i_y] - xStar[j_y]) / r) ** 2 * ddW(r);
        }

        const f_vorticity =
          (vorticity * (i % 2 === 0 ? dVorticity_x : dVorticity_y)) /
          length(dVorticity_x, dVorticity_y);
        return vi + 2.74 * viscosity + deltaT * 3.1 * f_vorticity;
      });

      result = expectToEqual(out, expected, result);
    }
    return result;
  });
}
