import * as THREE from "three";

import computeShader1Code from "./shaders/compute-shader-1.glsl";
import computeShader3Code from "./shaders/compute-shader-3.glsl";
import computeShader4Code from "./shaders/compute-shader-4.glsl";
import computeShader5Code from "./shaders/compute-shader-5.glsl";
import computeShader6Code from "./shaders/compute-shader-6.glsl";
import assignPositionsCode from "./shaders/assign-positions.glsl";

import { GPUCompute } from "./GPUCompute";
import { SDF } from "./sdf";
import {
  SolidObjs,
  Vec2,
  bytesToFloat,
  floatToBytesArray,
  getSizeXY,
  initMask,
  initTexture,
  texCoords,
  fTrianglesEqual,
} from "./helper";
import {
  LineSegmentsReference,
  cleanupLineSegments,
  trianglesToLineSegments,
} from "./boundsHelper";

const NUL = Number.parseFloat(import.meta.env.VITE_NUL);

interface OptParamsSetter {
  SOLVER_ITERATIONS?: number;
  GRIDSIZE?: number;
  BOUNDARY_MARGIN?: number;
  KERNEL_WIDTH?: number;
  GRAVITY?: number;
  REST_DENSITY?: number;
  CONSTRAINT_RELAXATION?: number;
  ARTIFICIAL_PRESSURE_SCALE?: number;
  ARTIFICIAL_PRESSURE_FIXED_KERNEL_DISTANCE?: number;
  ARTIFICIAL_PRESSURE_POWER?: number;
  VORTICITY_COEFFICIENT?: number;
  VISCOSITY_COEFFICIENT?: number;
}
export class SimParams {
  SOLVER_ITERATIONS: number;
  GRIDSIZE: number;
  BOUNDARY_MARGIN: number;
  KERNEL_WIDTH: number;
  GRAVITY: number;
  REST_DENSITY: number;
  CONSTRAINT_RELAXATION: number;
  ARTIFICIAL_PRESSURE_SCALE: number;
  ARTIFICIAL_PRESSURE_FIXED_KERNEL_DISTANCE: number;
  ARTIFICIAL_PRESSURE_POWER: number;
  VORTICITY_COEFFICIENT: number;
  VISCOSITY_COEFFICIENT: number;

  constructor(params: OptParamsSetter = {}) {
    this.SOLVER_ITERATIONS = params.SOLVER_ITERATIONS ?? 3;
    this.GRIDSIZE = params.GRIDSIZE ?? 1;
    this.BOUNDARY_MARGIN = params.BOUNDARY_MARGIN ?? 0.5;
    this.KERNEL_WIDTH = params.KERNEL_WIDTH ?? 1.32;
    this.GRAVITY = params.GRAVITY ?? 125;
    this.REST_DENSITY = params.REST_DENSITY ?? 0.877;
    this.CONSTRAINT_RELAXATION = params.CONSTRAINT_RELAXATION ?? 3.2;
    this.ARTIFICIAL_PRESSURE_SCALE = params.ARTIFICIAL_PRESSURE_SCALE ?? 0.1;
    this.ARTIFICIAL_PRESSURE_FIXED_KERNEL_DISTANCE =
      params.ARTIFICIAL_PRESSURE_FIXED_KERNEL_DISTANCE ??
      0.07 * this.KERNEL_WIDTH;
    this.ARTIFICIAL_PRESSURE_POWER = params.ARTIFICIAL_PRESSURE_POWER ?? 2;
    this.VORTICITY_COEFFICIENT = params.VORTICITY_COEFFICIENT ?? 0.4;
    this.VISCOSITY_COEFFICIENT = params.VISCOSITY_COEFFICIENT ?? 0.3;
  }
}
type GridMap = Map<string, number[]>;

export class Algorithm {
  last: number = -1;
  params: SimParams;
  initPositions?: () => THREE.Texture;
  positions?: THREE.Texture;
  velocities?: THREE.Texture;

  bounds: SolidObjs = [];
  newBounds: SolidObjs = [];
  boundsSegments: LineSegmentsReference = [];
  boundsNormals: boolean[][] = [];
  boundsChanged: boolean = false;

  protected xStarBytes?: Uint8Array;
  protected xStar?: Float32Array;
  protected allNeighbours?: number[][];
  gpuComputes: GPUCompute[] = Array(8);
  sdf?: SDF;

  private renderer: THREE.WebGLRenderer;
  debug: boolean = false;

  // for referencing

  protected pRefNData?: Float32Array;
  protected pRefN?: THREE.Texture;
  protected pRefPNData?: Float32Array;
  protected pRefPN?: THREE.Texture;
  protected gpuc3References: { [key: string]: Float32Array } = {};
  // There is definitely unnecessary repetitiveness here.
  // Consider turning these varyings into three textures that's shared between the shaders
  //  (giving them the responsibility to interpret it for their structure properly).
  protected C4_pRefN_startIndex?: Float32Array;
  protected C5_pRefN_startIndex?: Float32Array;
  protected C6_pRefN_startIndex?: Float32Array;
  protected C4_pRefN_Length?: Float32Array;
  protected C5_pRefN_Length?: Float32Array;
  protected C6_pRefN_Length?: Float32Array;
  protected C4_numExtras?: Float32Array;
  protected C5_numExtras?: Float32Array;

  private P_: number = -1;
  get P(): number {
    return this.P_;
  }
  private N_: number = -1;
  get N(): number {
    return this.N_;
  }
  private MAX_NEIGHBOURS_: number = -1;
  get MAX_NEIGHBOURS(): number {
    return this.MAX_NEIGHBOURS_;
  }
  initialized: boolean = false;

  constructor(renderer: THREE.WebGLRenderer, params: OptParamsSetter = {}) {
    this.params = new SimParams(params);
    this.renderer = renderer;
  }

  init(
    nParticles: number,
    maxNeighbours: number,
    bounds: SolidObjs = [],
    initPositions:
      | ((i: number) => Vec2)
      | number[]
      | Float32Array
      | THREE.Texture
  ) {
    this.P_ = 2 * nParticles;
    this.MAX_NEIGHBOURS_ = maxNeighbours;
    this.N_ = 2 * nParticles * maxNeighbours;

    // If initPositions is a function
    if (
      ((value: typeof initPositions): value is (i: number) => Vec2 =>
        typeof value === "function")(initPositions)
    )
      this.initPositions = () => {
        const texture = initTexture(this.P);
        texture.needsUpdate = true;
        const theArray = texture.image.data;
        for (let i = 0; i < nParticles; i++) {
          const pos = initPositions(i);
          theArray.set(floatToBytesArray(pos[0]), i * 2 * 4);
          theArray.set(floatToBytesArray(pos[1]), (i * 2 + 1) * 4);
        }
        return texture;
      };
    else if (
      initPositions instanceof Float32Array ||
      Array.isArray(initPositions)
    )
      this.initPositions = () => {
        const texture = initTexture(this.P);
        texture.needsUpdate = true;
        texture.image.data.set(initPositions);
        return texture;
      };
    else if (initPositions instanceof THREE.Texture)
      this.initPositions = () => initPositions;

    this.initCreateInputs();

    this.bounds = bounds;
    [this.boundsSegments, this.boundsNormals] = cleanupLineSegments(
      ...trianglesToLineSegments(bounds, {
        normals: true,
        triangleRef: true,
      })
    );

    this.sdf = new SDF(this.renderer, {
      width: 200,
      height: 200,
      boundaryMargin: this.params.BOUNDARY_MARGIN,
    });
    this.sdf.returnSDF(this.boundsSegments, this.boundsNormals);

    this.gpuComputes[1] = new GPUCompute(
      this.P * 2,
      computeShader1Code,
      this.renderer,
      [
        { name: "force", itemSize: 1 },
        { name: "positionsTexture" },
        { name: "velocitiesTexture" },
        { name: "GPUC1_Mask", texture: initMask(this.P, 2) },
      ]
    );

    // x/y components combined, and for every p_ij there's a redundant p_ji, thus `... / 2 / 2`, or `... / 4`
    this.gpuComputes[3] = new GPUCompute(
      (this.N / 4) * 3,
      computeShader3Code,
      this.renderer,
      [
        { name: "GPUC3_Mask", texture: initMask(this.N / 4, 3) },
        { name: "xStarAndVelocity" },
        { name: "pi_xReference", itemSize: 2, updates: true },
        { name: "pi_yReference", itemSize: 2, updates: true },
        { name: "pj_xReference", itemSize: 2, updates: true },
        { name: "pj_yReference", itemSize: 2, updates: true },
      ]
    );
    this.gpuComputes[3].updateUniform("h", this.params.KERNEL_WIDTH);
    this.gpuComputes[3].updateUniform("NUL", NUL);

    // x/y components combined, thus `... / 2`
    this.gpuComputes[4] = new GPUCompute(
      (this.P / 2) * 3,
      computeShader4Code,
      this.renderer,
      [
        { name: "GPUC4_Mask", texture: initMask(this.P / 2, 3) },
        { name: "GPUC3_Out", texture: initTexture((this.N / 4) * 3) },
        { name: "pRefN_startIndex", itemSize: 1, updates: true },
        { name: "pRefN_Length", itemSize: 1, updates: true },
        { name: "numExtras", itemSize: 1, updates: true },
        { name: "pRefN" },
      ]
    );
    this.gpuComputes[4].updateUniform("NUL", NUL);
    this.gpuComputes[4].updateUniform("h", this.params.KERNEL_WIDTH);
    this.gpuComputes[4].updateUniform("restDensity", this.params.REST_DENSITY);
    this.gpuComputes[4].updateUniform(
      "constraintRelaxation",
      this.params.CONSTRAINT_RELAXATION
    );
    this.gpuComputes[4].updateUniform(
      "APk",
      this.params.ARTIFICIAL_PRESSURE_SCALE
    );
    this.gpuComputes[4].updateUniform(
      "APdeltaQ",
      this.params.ARTIFICIAL_PRESSURE_FIXED_KERNEL_DISTANCE
    );
    this.gpuComputes[4].updateUniform(
      "APn",
      this.params.ARTIFICIAL_PRESSURE_POWER
    );

    this.gpuComputes[5] = new GPUCompute(
      this.P * 2,
      computeShader5Code,
      this.renderer,
      [
        { name: "GPUC5_Mask", texture: initMask(this.P, 2) },
        { name: "GPUC3_Out", texture: initTexture((this.N / 4) * 3) },
        { name: "GPUC4_Out", texture: initTexture((this.P / 2) * 3) },
        { name: "pRefN_startIndex", itemSize: 1, updates: true },
        { name: "pRefN_Length", itemSize: 1, updates: true },
        { name: "numExtras", itemSize: 1, updates: true },
        { name: "pRefN" },
        { name: "pRefPN" },
        { name: "xStarAndVelocity" },
        { name: "X" },
        { name: "SDF" },
      ]
    );
    this.gpuComputes[5].updateUniform("NUL", NUL);
    this.gpuComputes[5].updateUniform(
      "lineBounds",
      Algorithm.prepareLineSegmentsReference(this.boundsSegments)
    );
    this.gpuComputes[5].updateUniform(
      "boundaryMargin",
      this.params.BOUNDARY_MARGIN
    );
    this.gpuComputes[5].updateUniform("restDensity", this.params.REST_DENSITY);
    this.gpuComputes[5].updateUniform("debug", false);

    this.gpuComputes[6] = new GPUCompute(
      this.P,
      computeShader6Code,
      this.renderer,
      [
        { name: "xStarAndVelocity" },
        { name: "X" },
        { name: "pRefN_startIndex", itemSize: 1, updates: true },
        { name: "pRefN_Length", itemSize: 1, updates: true },
        { name: "pRefPN" },
      ]
    );
    this.gpuComputes[6].updateUniform("h", this.params.KERNEL_WIDTH);
    this.gpuComputes[6].updateUniform(
      "vorticityCoefficient",
      this.params.VORTICITY_COEFFICIENT
    );
    this.gpuComputes[6].updateUniform(
      "viscosityCoefficient",
      this.params.VISCOSITY_COEFFICIENT
    );
    this.gpuComputes[6].updateUniform("debug", false);

    this.gpuComputes[7] = new GPUCompute(
      this.P,
      assignPositionsCode,
      this.renderer,
      [{ name: "xStarAndVelocity" }]
    );

    // Provide some constant uniforms for all shaders
    const pRes = new Float32Array(getSizeXY(this.P));
    const nRefRes = new Float32Array([
      (this.pRefN as THREE.DataTexture).image.width,
      (this.pRefN as THREE.DataTexture).image.height,
    ]);

    const computeIDs = this.gpuComputes.map((_el, i) => i).flat();
    for (const i of computeIDs) {
      for (const c of computeIDs) {
        if (c === i) continue;
        this.gpuComputes[i].updateUniform(
          `c${c}Resolution`,
          new Float32Array([
            this.gpuComputes[c].sizeX,
            this.gpuComputes[c].sizeY,
          ])
        );
      }
      this.gpuComputes[i].updateUniform("pRes", pRes);
      this.gpuComputes[i].updateUniform("nRefRes", nRefRes);
      this.gpuComputes[i].updateUniform("P", this.P);
      this.gpuComputes[i].updateUniform("N", this.N);
    }

    this.initSetInputs();
  }
  static prepareLineSegmentsReference(lineSegments: LineSegmentsReference) {
    const lineSegments_ = lineSegments.flat(2);
    lineSegments_.push(NUL);
    return lineSegments_;
  }

  initCreateInputs() {
    this.positions = this.initPositions!();
    this.velocities = initTexture(this.P);

    this.xStarBytes = new Uint8Array(this.P * 4);
    this.xStar = new Float32Array(this.xStarBytes.buffer);
    this.allNeighbours = Array(this.P / 2);

    this.pRefNData = new Float32Array(this.N);
    this.pRefPNData = new Float32Array(this.N / 2);
    const [pRefNsizeX, pRefNsizeY] = getSizeXY(this.N / 2);
    // pRefN stores texture coordinates, while pRefPN stores indices,
    //  hence the slight differences between the two here. No reason for this,
    //  and it'd be better for both to store indices instead.
    this.pRefN = new THREE.DataTexture(
      this.pRefNData,
      pRefNsizeX,
      pRefNsizeY,
      THREE.RGFormat,
      THREE.FloatType
    );
    this.pRefPN = new THREE.DataTexture(
      this.pRefPNData,
      pRefNsizeX,
      pRefNsizeY,
      THREE.RedFormat,
      THREE.FloatType
    );

    ["pi_x", "pi_y", "pj_x", "pj_y"].forEach(
      (name) =>
        (this.gpuc3References[name] = new Float32Array((this.N / 2) * 3).fill(
          NUL
        ))
    );

    this.C4_pRefN_startIndex = new Float32Array((this.P / 2) * 3);
    this.C4_pRefN_Length = new Float32Array((this.P / 2) * 3);
    this.C4_numExtras = new Float32Array((this.P / 2) * 3);
    this.C5_pRefN_startIndex = new Float32Array(this.P * 2);
    this.C5_pRefN_Length = new Float32Array(this.P * 2);
    this.C5_numExtras = new Float32Array(this.P * 2);
    this.C6_pRefN_startIndex = new Float32Array(this.P);
    this.C6_pRefN_Length = new Float32Array(this.P);

    this.initialized = true;
  }
  initSetInputs() {
    if (!this.isInitialized()) return;

    Object.entries(this.gpuc3References).forEach(
      ([name, data]) =>
        (this.gpuComputes[3].varInputs[name + "Reference"] = data)
    );

    this.gpuComputes[4].texInputs.pRefN = this.pRefN;
    this.gpuComputes[4].texInputs.GPUC3_Out =
      this.gpuComputes[3].renderTarget.texture;
    this.gpuComputes[4].varInputs.pRefN_startIndex = this.C4_pRefN_startIndex;
    this.gpuComputes[4].varInputs.pRefN_Length = this.C4_pRefN_Length;
    this.gpuComputes[4].varInputs.numExtras = this.C4_numExtras;

    this.gpuComputes[5].texInputs.pRefN = this.pRefN;
    this.gpuComputes[5].texInputs.pRefPN = this.pRefPN;
    this.gpuComputes[5].texInputs.GPUC3_Out =
      this.gpuComputes[3].renderTarget.texture;
    this.gpuComputes[5].texInputs.GPUC4_Out =
      this.gpuComputes[4].renderTarget.texture;
    this.gpuComputes[5].varInputs.pRefN_startIndex = this.C5_pRefN_startIndex;
    this.gpuComputes[5].varInputs.pRefN_Length = this.C5_pRefN_Length;
    this.gpuComputes[5].varInputs.numExtras = this.C5_numExtras;
    this.gpuComputes[5].texInputs.SDF = this.sdf.gpuc.renderTarget.texture;

    this.gpuComputes[6].texInputs.pRefPN = this.pRefPN;
    this.gpuComputes[6].varInputs.pRefN_startIndex = this.C6_pRefN_startIndex;
    this.gpuComputes[6].varInputs.pRefN_Length = this.C6_pRefN_Length;
  }

  isInitialized(): this is AlgorithmIsInitialized {
    return this.initialized;
  }

  createGridMap(positions: Float32Array) {
    const gridMap = new Map();
    const round = (num: number) =>
      this.params.GRIDSIZE * Math.round(num / this.params.GRIDSIZE);
    for (let i = 0; i < positions.length / 2; i++) {
      const coords = `${round(positions[i * 2])},${round(
        positions[i * 2 + 1]
      )}`;
      if (!gridMap.get(coords)) gridMap.set(coords, []);
      gridMap.get(coords)?.push(i);
    }
    return gridMap;
  }

  findNeighbouringParticles(
    index: number,
    positions: Float32Array,
    gridMap: GridMap
  ) {
    const round = (num: number) =>
      this.params.GRIDSIZE * Math.round(num / this.params.GRIDSIZE);
    let neighbours: number[] = [];
    const posIDx = round(positions[index * 2]);
    const posIDy = round(positions[index * 2 + 1]);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) {
        const id = `${posIDx + i * this.params.GRIDSIZE},${
          posIDy + j * this.params.GRIDSIZE
        }`;
        // let cellEntries = gridMap.get(id) ?? [];
        // cellEntries = cellEntries.filter((id_) => id_ > index);
        neighbours.push(
          ...(gridMap.get(id) ?? []).filter((id_) => id_ > index)
        );
      }
    return neighbours;
  }

  step(fixedDeltaT?: number, noSDFRefresh: boolean = false) {
    if (!this.isInitialized()) throw new Error("Didn't yet call `.init()`");

    let delta: number;
    if ((fixedDeltaT ?? null) === null) {
      const now = performance.now();
      if (this.last === -1) this.last = now - 16.6;
      delta = (now - this.last) / 1000;
      if (delta > 0.02) delta = 0.02;
      this.last = now;
    } else {
      delta = fixedDeltaT!;
    }
    this.gpuComputes.forEach((gpuc) => gpuc.updateUniform("deltaT", delta));

    this.consumeNewBoundsDifference();

    this.gpuComputes[1].varInputs.force = new Float32Array(
      Array(this.P).fill([0, -this.params.GRAVITY]).flat()
    );
    this.gpuComputes[1].texInputs.velocitiesTexture = this.velocities;
    this.gpuComputes[1].texInputs.positionsTexture = this.positions;
    this.gpuComputes[1].compute();
    // Potential issue here with odd-numbered sizeY, with the desired values
    //  not all fitting within a rectangle
    if (this.gpuComputes[1].sizeY % 2 !== 0)
      throw new Error(
        `Odd number for height of GPUC1: ${this.gpuComputes[1].sizeY}`
      );
    this.renderer.readRenderTargetPixels(
      this.gpuComputes[1].renderTarget,
      0,
      this.gpuComputes[1].sizeY / 2,
      this.gpuComputes[1].sizeX,
      this.gpuComputes[1].sizeY / 2,
      this.xStarBytes
    );

    const gridMap = this.createGridMap(this.xStar);
    let accumIndex = 0;
    let accumIndexFull = 0;
    const IDcumsum: number[] = [];

    for (let i = 0; i < this.xStar.length / 2; i++) {
      this.allNeighbours[i] = this.findNeighbouringParticles(
        i,
        this.xStar,
        gridMap
      );
      if (this.allNeighbours[i].length + accumIndex / 2 > this.N / 4) {
        if (accumIndex / 2 > this.N / 4)
          console.warn(
            "Particles exceed an average MAX_NEIGHBOURS. Expect the unexpected."
          );
        this.allNeighbours[i] = this.allNeighbours[i].slice(
          0,
          this.N / 4 - accumIndex / 2
        );
      }

      const texPCoords = texCoords.bind(
        null,
        this.gpuComputes[1].sizeX,
        this.gpuComputes[1].sizeY
      );
      // prettier-ignore
      {
      this.gpuc3References.pi_x.set(Array(this.allNeighbours[i].length).fill(texPCoords(i * 2 + this.P)).flat(), accumIndex);
      this.gpuc3References.pi_y.set(Array(this.allNeighbours[i].length).fill(texPCoords(i * 2 + 1 + this.P)).flat(), accumIndex);
      this.gpuc3References.pj_x.set(this.allNeighbours[i].flatMap((id_) => texPCoords(id_ * 2 + this.P)), accumIndex);
      this.gpuc3References.pj_y.set(this.allNeighbours[i].flatMap((id_) => texPCoords(id_ * 2 + 1 + this.P)), accumIndex);
      }

      const texNCoords = texCoords.bind(
        null,
        this.gpuComputes[3].sizeX,
        this.gpuComputes[3].sizeY
      );
      // resolves to e.g. "[6, 7, 8, 9, 10, 11]"
      const nIDs = Array.from(
        Array(this.allNeighbours[i].length),
        (_, i) => i + accumIndex / 2
      );

      let extraIDs: number[] = Array(this.allNeighbours.length); // indices for xStar
      let extraNeighbours: number[] = Array(this.allNeighbours.length); // indices for GPUC3
      for (let i_ = 0; i_ < this.allNeighbours.length; i_++) {
        const id = this.allNeighbours[i_]?.indexOf(i) ?? -1;
        if (id !== -1) {
          extraNeighbours[i_] = id + IDcumsum[i_];
          extraIDs[i_] = i_;
        }
      }
      extraIDs = extraIDs.flat(); // culls out "<empty slot>s"
      extraNeighbours = extraNeighbours.flat();

      const nRefFull = [...nIDs, ...extraNeighbours].flatMap((id_) =>
        texNCoords(id_)
      );
      this.pRefNData.set(nRefFull, accumIndexFull);
      this.pRefN.needsUpdate = true;

      this.C4_pRefN_startIndex.set([accumIndexFull / 2], i);
      this.C4_pRefN_Length.set([nRefFull.length / 2], i);
      this.C4_numExtras.set([extraIDs.length], i);

      this.C5_pRefN_startIndex.set(
        Array(2).fill(accumIndexFull / 2),
        this.P + i * 2
      );
      this.C5_pRefN_Length.set(
        Array(2).fill(nRefFull.length / 2),
        this.P + i * 2
      );
      this.C5_numExtras.set(Array(2).fill(extraIDs.length), this.P + i * 2);

      this.C6_pRefN_startIndex.set(Array(2).fill(accumIndexFull / 2), i * 2);
      this.C6_pRefN_Length.set(Array(2).fill(nRefFull.length / 2), i * 2);

      this.pRefPNData.set(
        [...this.allNeighbours[i], ...extraIDs],
        accumIndexFull / 2
      );
      this.pRefPN.needsUpdate = true;

      IDcumsum.push(accumIndex / 2);
      accumIndex += this.allNeighbours[i].length * 2;
      accumIndexFull += nRefFull.length;
    }
    // Copy the varying values into each part of the mask
    // GPUC3
    for (let k = 1; k < 3; k++) {
      Object.entries(this.gpuc3References).forEach(([_name, data]) =>
        data.set(data.slice(0, this.N / 2), k * (this.N / 2))
      );
    }
    // GPUC4
    for (let k = 1; k < 3; k++) {
      [
        this.C4_pRefN_startIndex,
        this.C4_pRefN_Length,
        this.C4_numExtras,
      ].forEach((var_) =>
        var_.set(var_.slice(0, this.P / 2), k * (this.P / 2))
      );
    }

    this.gpuComputes.forEach((gpuc) => gpuc.updateVaryings());

    this.gpuComputes[5].texInputs.X = this.positions;
    this.gpuComputes[5].updateUniform(
      "lineBounds",
      Algorithm.prepareLineSegmentsReference(this.boundsSegments)
    );
    this.gpuComputes[5].texInputs.SDF = this.sdf.returnSDF();
    this.gpuComputes[5].updateUniform("SDFtranslate", this.sdf.translate);
    this.gpuComputes[5].updateUniform("SDFscale", this.sdf.scale);
    this.gpuComputes[5].updateUniform("debug", this.debug);

    let xStarAndVelocity = this.gpuComputes[1].renderTarget.texture;
    for (let _ = 0; _ < this.params.SOLVER_ITERATIONS; _++) {
      this.gpuComputes[3].texInputs.xStarAndVelocity = xStarAndVelocity;
      this.gpuComputes[3].compute();
      this.gpuComputes[4].compute();

      this.gpuComputes[5].texInputs.xStarAndVelocity = xStarAndVelocity;
      xStarAndVelocity = this.gpuComputes[5].compute(true)!;
    }
    if (this.debug)
      this.logComputeOut(5, (arr_: Float32Array) => {
        const arr = arr_.slice(this.P);
        return [
          arr.filter(
            (_, i) =>
              arr[Math.floor(i / 2) * 2] < -50 ||
              arr[Math.floor(i / 2) * 2] > 50 ||
              arr[Math.floor(i / 2) * 2 + 1] < -50 ||
              arr[Math.floor(i / 2) * 2 + 1] > 50
          ),
          arr.filter((el) => isNaN(el) || !isFinite(el)).length,
        ];
      });

    this.gpuComputes[6].texInputs.xStarAndVelocity = xStarAndVelocity;
    this.gpuComputes[6].texInputs.X = this.positions;
    if (!this.debug) this.gpuComputes[6].compute();
    if (!this.debug) this.velocities = this.gpuComputes[6].renderTarget.texture;

    this.gpuComputes[7].texInputs.xStarAndVelocity = xStarAndVelocity;
    if (!this.debug) this.gpuComputes[7].compute();
    if (!this.debug) this.positions = this.gpuComputes[7].renderTarget.texture;

    this.debug = false;

    if (!noSDFRefresh && this.boundsChanged) {
      this.bounds = this.newBounds;
      this.sdf.returnSDF(this.boundsSegments, this.boundsNormals);
      this.boundsChanged = false;
    }

    return this.positions;
  }

  pause() {
    this.last = -1;
  }

  updateBounds(bounds: SolidObjs) {
    if (!this.isInitialized()) throw new Error("Algorithm not initialized");
    if (bounds.length !== this.bounds.length) {
      console.log(bounds, this.bounds);
      throw new Error("updateBounds cannot add or remove bounds!");
    }

    this.newBounds = bounds;
  }

  consumeNewBoundsDifference() {
    if (!this.isInitialized()) throw new Error("Algorithm not initialized");

    this.newBounds.forEach((triangle, i) => {
      if (!fTrianglesEqual(this.bounds[i], triangle)) {
        this.sdf.moveSegmentGroup(this.bounds[i], triangle);
        this.boundsChanged = true;
      }
    });

    if (!this.boundsChanged) return;
    [this.boundsSegments, this.boundsNormals] = cleanupLineSegments(
      ...trianglesToLineSegments(this.newBounds, {
        normals: true,
        triangleRef: true,
      })
    );
  }

  correctInitialPositions() {
    this.step(0);
    this.velocities = initTexture(this.P);
  }

  logComputeOut(gpucNum: number, prepareOut?: Function) {
    const gpuCompute = this.gpuComputes[gpucNum];

    const pixelBuffer = new Uint8Array(gpuCompute.sizeX * gpuCompute.sizeY * 4);
    this.renderer.readRenderTargetPixels(
      gpuCompute.renderTarget,
      0,
      0,
      gpuCompute.sizeX,
      gpuCompute.sizeY,
      pixelBuffer
    );
    const pixelBufferFloats = Array(...pixelBuffer)
      .map((_el, i) =>
        i % 4 === 0 ? bytesToFloat(pixelBuffer.slice(i, i + 4)) : 0
      )
      .filter((_el, i) => i % 4 === 0);
    console.log(prepareOut ? prepareOut(pixelBufferFloats) : pixelBufferFloats);
  }
}

class AlgorithmIsInitialized extends Algorithm {
  declare sdf: SDF;
  declare positions: THREE.Texture;
  declare velocities: THREE.Texture;
  declare xStarBytes: Uint8Array;
  declare xStar: Float32Array;
  declare allNeighbours: number[][];
  declare pRefNData: Float32Array;
  declare pRefN: THREE.Texture;
  declare pRefPNData: Float32Array;
  declare pRefPN: THREE.Texture;

  declare C4_pRefN_startIndex: Float32Array;
  declare C5_pRefN_startIndex: Float32Array;
  declare C6_pRefN_startIndex: Float32Array;
  declare C4_pRefN_Length: Float32Array;
  declare C5_pRefN_Length: Float32Array;
  declare C6_pRefN_Length: Float32Array;
  declare C4_numExtras: Float32Array;
  declare C5_numExtras: Float32Array;
}
