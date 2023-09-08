import {
  bytesToFloats,
  computeAndRead,
  expectToEqual,
  fillBytesTexture,
  getSizeXY,
  randIndices,
  texCoords,
} from "../helper";
import { ShaderTestEnv, it, TestResult } from "./Algorithm.test";

export default function testGPUC3(env: ShaderTestEnv) {
  const algorithm = env.algorithm;
  const nParticles = env.nParticles;
  const maxNeighbours = env.maxNeighbours;
  const P = env.P;
  const N = env.N;

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
