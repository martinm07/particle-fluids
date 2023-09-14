import {
  bytesToFloats,
  computeAndRead,
  expectToEqual,
  fillBytesTexture,
  fillFloatsTexture,
  getSizeXY,
  randIndices,
  texCoords,
  rng,
} from "../helper";
import { ShaderTestEnv, it, TestResult } from "./Algorithm.test";
import lineBoundsTests from "./lineBoundsTests.json" assert { type: "json" };

export default function testGPUC5(env: ShaderTestEnv) {
  const algorithm = env.algorithm;
  const nParticles = env.nParticles;
  const maxNeighbours = env.maxNeighbours;
  const P = env.P;
  const N = env.N;

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
    let msg = "";
    for (const { lineBounds, x, xStar, expected } of lineBoundsTests) {
      algorithm.init(nParticles, maxNeighbours, lineBounds);
      let gpuc = algorithm.gpuComputes[5];
      // "boundaryMargin": When a particle intersects, it will stop at exactly this distance
      //  away from the boundary.
      gpuc.updateUniform("boundaryMargin", 0.5);

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
      if (!expectToEqual(out, expected_)[0]) {
        msg += `[${lineBounds}]-(${out.slice(
          0,
          expected.length
        )})!=(${expected})    `;
      }
    }
    if (msg) result[1] = msg;
    return result;
  });

  it("should behave as expected for various nParticles", () => {
    let result: TestResult = [true];
    for (const nParticles of [64, 28, 30, 25, 400]) {
      const lineBounds = [[-100, -4, 100, -4]];
      algorithm.init(nParticles, maxNeighbours, lineBounds);
      const gpuc = algorithm.gpuComputes[5];
      gpuc.updateUniform("boundaryMargin", 0);

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
        i < P ? 0 : Math.floor(rng() * 10)
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
        i < P ? 0 : Math.floor(rng() * lens[i])
      );
      extras = extras.map((el, i) => (i % 2 === 1 ? extras[i - 1] : el));
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
      const expectedB = new Float32Array([...expected]);
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
          expectedB[i * 2] = x - ((y + 4) * (x - xStar)) / (y - yStar);
          expectedB[i * 2 + 1] = -4;
        }
      }
      const expected_ = new Float32Array([
        ...xStarAndVel.slice(0, P),
        ...expectedB,
      ]);

      // gpuc.updateUniform("debug", true);
      // console.log(computeAndRead(gpuc).slice(P));
      for (let i = 0; i < P; i++) {
        const i_ = i + P;
        const pI_x = Math.floor(i / 2) * 2;
        const pI_y = Math.floor(i / 2) * 2 + 1;
        if (
          !expectToEqual(out.slice(i_, i_ + 1), expected_.slice(i_, i_ + 1))[0]
        ) {
          console.log(
            `(${X[pI_x]}, ${X[pI_y]}) --> (${expected[pI_x]}, ${
              expected[pI_y]
            })\nx: ${out[P + pI_x]} === ${expectedB[pI_x]}\ny: ${
              out[P + pI_y]
            } === ${expectedB[pI_y]}`
          );
        }
      }

      result = expectToEqual(out, expected_, result);
    }
    return result;
  });
}
