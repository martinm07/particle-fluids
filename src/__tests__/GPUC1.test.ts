import {
  bytesToFloats,
  computeAndRead,
  expectToEqual,
  fillArr,
  fillBytesTexture,
  getSizeXY,
} from "../helper";
import { initAlg, it, ShaderTestEnv, TestResult } from "./Algorithm.test";

export default function testGPUC1(env: ShaderTestEnv) {
  const algorithm = env.algorithm;
  const nParticles = env.nParticles;
  const maxNeighbours = env.maxNeighbours;
  const P = env.P;

  it("should not change positions nor velocities in 0 delta time", () => {
    initAlg(algorithm, nParticles, maxNeighbours);

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
    initAlg(algorithm, nParticles, maxNeighbours);

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
    initAlg(algorithm, nParticles, maxNeighbours);

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
    initAlg(algorithm, nParticles, maxNeighbours);

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
    initAlg(algorithm, nParticles, maxNeighbours);
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
      initAlg(algorithm, nParticles, maxNeighbours);
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
