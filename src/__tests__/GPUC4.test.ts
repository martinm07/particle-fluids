import {
  bytesToFloats,
  computeAndRead,
  expectToEqual,
  fillBytesTexture,
  fillFloatsTexture,
  getSizeXY,
  texCoords,
} from "../helper";
import { ShaderTestEnv, it, TestResult } from "./Algorithm.test";

export default function testGPUC4(env: ShaderTestEnv) {
  const algorithm = env.algorithm;
  const nParticles = env.nParticles;
  const maxNeighbours = env.maxNeighbours;
  const P = env.P;
  const N = env.N;

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
