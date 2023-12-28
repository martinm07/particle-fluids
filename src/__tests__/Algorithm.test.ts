import { WebGLRenderer } from "three";

import { Algorithm } from "../Algorithm";
import testGPUC1 from "./GPUC1.test";
import testGPUC3 from "./GPUC3.test";
import testGPUC4 from "./GPUC4.test";
import testGPUC5 from "./GPUC5.test";
import testGPUC6 from "./GPUC6.test";

let report = "";
let logColors: string[] = [];

function describe(name: string, callback: Function) {
  report = "";
  logColors = [];
  report += `%c${name}%c\n`;
  logColors.push("font-weight: bold; font-size: 130%", "");
  callback(env);
  console.log(report, ...logColors);
}
export function it(description: string, test: () => TestResult) {
  const [success, received] = test();
  logColors.push(`color: ${success ? "green" : "red"}`, "color: default");
  report += `  ...${description} %c${String(
    received ?? (success ? "passed" : "failed")
  )}%c\n`;
}

export class ShaderTestEnv {
  nParticles: number;
  P: number;
  maxNeighbours: number;
  N: number;
  renderer: WebGLRenderer;
  algorithm: Algorithm;

  constructor(nParticles: number, maxNeighbours: number) {
    this.nParticles = nParticles;
    this.P = 2 * nParticles;
    this.maxNeighbours = maxNeighbours;
    this.N = 2 * nParticles * maxNeighbours;

    this.renderer = new WebGLRenderer();
    this.algorithm = new Algorithm(this.renderer);
  }
}
export type TestResult = [success: boolean, received?: unknown];

export function test() {
  describe("GPUCompute 1", testGPUC1);
  describe("GPUCompute 3", testGPUC3);
  describe("GPUCompute 4", testGPUC4);
  describe("GPUCompute 5", testGPUC5);
  describe("GPUCompute 6", testGPUC6);
}

const env = new ShaderTestEnv(64, 50);
console.log(`P: ${env.P}, N: ${env.N}`);

// TODO: UPDATE TESTS

export function initAlg(
  algorithm: Algorithm,
  nParticles: number,
  maxNeighbours: number,
  lineBounds?: number[][]
) {
  // init positions not really used, can be whatever
  algorithm.init(nParticles, maxNeighbours, lineBounds ?? [], (i) => {
    return [(i % 15) - 7.5, Math.floor(i / 15)];
  });
}
