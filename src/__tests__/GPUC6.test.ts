import {
  bytesToFloats,
  computeAndRead,
  expectToEqual,
  fillBytesTexture,
  fillFloatsTexture,
  getSizeXY,
  randIndices,
} from "../helper";
import { ShaderTestEnv, it, TestResult, initAlg } from "./Algorithm.test";

const TOL = Number.parseFloat(import.meta.env.VITE_TOL) / 10;

export default function testGPUC6(env: ShaderTestEnv) {
  const algorithm = env.algorithm;
  const nParticles = env.nParticles;
  const maxNeighbours = env.maxNeighbours;
  const P = env.P;
  const N = env.N;

  it("should be 0 for x* = x", () => {
    initAlg(algorithm, nParticles, maxNeighbours);
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
    initAlg(algorithm, nParticles, maxNeighbours);
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
    initAlg(algorithm, nParticles, maxNeighbours);
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
    const out = computeAndRead(gpuc).slice(2);

    const length = (x: number, y: number) => Math.sqrt(x ** 2 + y ** 2);
    const W = (r: number) =>
      r < h ? (315 / (64 * Math.PI * h ** 9)) * (h ** 2 - r ** 2) ** 3 : 0;
    const expected = new Float32Array(P - 2).map((_, i_) => {
      const i = i_ + 2;
      let viscosity = 0;
      for (let j = 0; j < lens[i]; j++) {
        const pji_x = xStar[2 * Math.floor(i / 2)] - xStar[0];
        const pji_y = xStar[2 * Math.floor(i / 2) + 1] - xStar[1];
        viscosity += W(length(pji_x, pji_y));
      }
      // const viscosity = W(Math.sqrt(2)) * lens[i];
      // Normally, this would be v_i + viscosity, but since v_i = xStar - X
      //  which will equal 0 in all but v_0, we don't have to bother.
      return viscosity;
    });
    return expectToEqual(out, expected);
  });

  it("should have vorticity 0 for ∇W 0", () => {
    initAlg(algorithm, nParticles, maxNeighbours);
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
      initAlg(algorithm, nParticles, maxNeighbours);
      const gpuc = algorithm.gpuComputes[6];
      const vorticityCoef = 3.3;
      gpuc.updateUniform("vorticityCoefficient", vorticityCoef);
      const viscosityCoef = 1.69;
      gpuc.updateUniform("viscosityCoefficient", viscosityCoef);
      const deltaT = 1;
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
        const i_x = Math.floor(i / 2) * 2;
        const i_y = Math.floor(i / 2) * 2 + 1;

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
          const dpjW_x = (-(xStar[i_x] - xStar[j_x]) / (r + TOL)) * dW(r);
          const dpjW_y = (-(xStar[i_y] - xStar[j_y]) / (r + TOL)) * dW(r);
          vorticity += vij_x * dpjW_y - vij_y * dpjW_x;

          dVorticity_x +=
            vij_y * ((xStar[i_x] - xStar[j_x]) / (r + TOL)) ** 2 * ddW(r);
          dVorticity_y +=
            -vij_x * ((xStar[i_y] - xStar[j_y]) / (r + TOL)) ** 2 * ddW(r);
        }

        const f_vorticity =
          (vorticity * (i % 2 === 0 ? dVorticity_x : dVorticity_y)) /
          (length(dVorticity_x, dVorticity_y) + TOL);
        return (
          vi + viscosityCoef * viscosity + deltaT * vorticityCoef * f_vorticity
        );
      });

      result = expectToEqual(out, expected, result);
    }
    return result;
  });
}
