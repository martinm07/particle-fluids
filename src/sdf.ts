import * as THREE from "three";
import { GPUCompute } from "./GPUCompute";
import { Vec2, Segment, Triangle } from "./helper";
import { LineSegmentsReference } from "./boundsHelper";
import GrahamScan from "graham-scanner";

import updateSDFShader from "./shaders/create-sdf.glsl";
import moveSegmentSDFShader from "./shaders/move-segments-sdf3.glsl";
// import moveSegmentsSDFShader2 from "./shaders/_DEPR_move-segments-sdf.glsl";

const NUL = Number.parseFloat(import.meta.env.VITE_NUL);

/*
IMP: First apply this.translate, then this.scale:
(p.x + SDF.translate[0]) * SDF.scale[0],
 p.y + SDF.translate[1]) * SDF.scale[1])
*/
export class SDF {
  width: number;
  height: number;
  boundaryMargin: number;

  bounds?: LineSegmentsReference;
  segmentNormals?: boolean[][];

  texture: THREE.Texture;

  gpuc: GPUCompute;
  movegpuc: GPUCompute;
  scale?: Vec2;
  translate?: Vec2;

  constructor(
    renderer: THREE.WebGLRenderer,
    params: { width: number; height: number; boundaryMargin: number } = {
      width: 200,
      height: 200,
      boundaryMargin: 0.5,
    }
  ) {
    this.width = params.width;
    this.height = params.height;
    this.boundaryMargin = params.boundaryMargin;

    this.gpuc = new GPUCompute(
      [this.width, this.height],
      updateSDFShader,
      renderer,
      [],
      {
        type: THREE.FloatType,
      }
    );
    this.gpuc.updateUniform("boundaryMargin", params.boundaryMargin);
    this.texture = this.gpuc.renderTarget.texture;

    // this.movegpuc = new GPUCompute(
    //   [this.width, this.height],
    //   moveSegmentsSDFShader2,
    //   renderer,
    //   [],
    //   {
    //     type: THREE.FloatType,
    //   }
    // );

    this.movegpuc = new GPUCompute(
      [this.width, this.height],
      moveSegmentSDFShader,
      renderer,
      [],
      {
        type: THREE.FloatType,
      }
    );
    this.movegpuc.updateUniform("boundaryMargin", params.boundaryMargin);
  }

  isInitialized(): this is SDFIsInitialized {
    if (this.bounds) return true;
    else return false;
  }

  updateCenterScale(): void;
  updateCenterScale(vertsX: number[], vertsY: number[], addVerts?: false): void;
  updateCenterScale(vertsX: number[], vertsY: number[], addVerts: true): void;
  // prettier-ignore
  updateCenterScale(vertsX?: number[], vertsY?: number[], addVerts?: boolean): void {
    if (!this.isInitialized()) return;
    if (this.bounds.length === 0) {
      this.scale = [1, 1];
      this.translate = [0, 0];
    } else {
      const vertsX_ =
      vertsX ?? this.bounds.flat(2).filter((_, i) => i % 2 === 0);
      const vertsY_ =
      vertsY ?? this.bounds.flat(2).filter((_, i) => i % 2 === 1);
      
      let top = Math.max.apply(null, vertsY_) + this.boundaryMargin;
      let right = Math.max.apply(null, vertsX_) + this.boundaryMargin;
      let bottom = Math.min.apply(null, vertsY_) - this.boundaryMargin;
      let left = Math.min.apply(null, vertsX_) - this.boundaryMargin;
      
      if (addVerts) {
        const oldLeft = -this.translate[0];
        const oldBottom = -this.translate[1];
        const oldRight = this.width / this.scale[0] + oldLeft;
        const oldTop = this.height / this.scale[1] + oldBottom;

        top = Math.max(top, oldTop);
        right = Math.max(right, oldRight);
        bottom = Math.min(bottom, oldBottom);
        left = Math.min(left, oldLeft);
      }

      // coordinates go from [0.5 -> 199.5, 0.5 -> 199.5]
      //  where (0.5, 0.5) is bottom left
      this.scale = [this.width / (right - left), this.height / (top - bottom)];
      this.translate = [-left, -bottom];
    }

    this.gpuc.updateUniform("scale", this.scale);
    this.gpuc.updateUniform("translate", this.translate);
    this.movegpuc.updateUniform("scale", this.scale);
    this.movegpuc.updateUniform("translate", this.translate);
  }

  returnSDF(): THREE.Texture;
  returnSDF(
    bounds: LineSegmentsReference,
    segmentNormals: boolean[][]
  ): THREE.Texture;
  returnSDF(bounds?: LineSegmentsReference, segmentNormals?: boolean[][]) {
    if (bounds) this.bounds = bounds;
    if (segmentNormals) this.segmentNormals = segmentNormals;

    if (bounds || segmentNormals) {
      const bounds_ = this.bounds!.flat();
      const normals_ = this.segmentNormals!.flat();
      // It's important that we flatten these arrays
      this.gpuc.updateUniform("bounds", bounds_.flat());
      this.gpuc.updateUniform("segNormals", normals_);

      this.updateCenterScale();

      this.gpuc.compute();
      this.texture = this.gpuc.renderTarget.texture;
    }

    return this.texture;
  }

  AToBInds(a: number, b: number, length: number, forwards: boolean = true) {
    const final: number[] = [];
    for (let i = 0; i < length; i++) {
      // const ind = (a + i) % length;
      let ind: number;
      if (forwards) ind = (a + i) % length;
      else ind = a - i < 0 ? a + length - i : a - i;
      final.push(ind);
      if (ind === b) break;
    }
    return final;
  }

  /**
   * The goal is to linearly interpolate the vertices of oldTri to newTri, and imagine how particles caught
   * in the path might be pushed out.
   *
   * The first step is to figure out the mapping of oldTri vertices to newTri vertices.\
   * There are 3! == 6 posibilities, however half of them flip the winding order of the triangle, and so really there are 3.
   * To choose from these 3, we calculate and subtract away the centroids of the triangles (when choosing the pairings,
   * translation of the triangles shouldn't matter, as the "shape" of the lerp is irrespective of that). Then, choose
   * the mapping that minimizes the average distance traveled by each of the vertices. From testing, this seems to always
   * provide the "most full" transformation that doesn't have vertices awkwardly going past each other, or creating points
   * where they're collinear.
   *
   * Now that we have the vertex mapping, we find the line segments of newTri that are part of the convex hull, call this
   * the "frontier" (where all the particles are going to be pushed to). Using the vertex mapping, we map these segments
   * to segments of oldTri.
   *
   * In the shader, we only affect positions inside the convex hull, that isn't already the inside of a solid (where the SDF < 0).
   * For one such position, first we find the closest point on the segs of oldTri (called backSegs), and for whatever segment that
   * happens to be, we go to the corresponding segment of newTri (frontSegs) and map to the percent along the line that the closest
   * point was. This is where we push the position.\
   * There are a couple potential issues with this. Firstly, it's not necessarily true that particles would only be pushed to
   * segments on the convex hull, nor to segments of newTri. Hopefully the updates to triangles are small enough such that this
   * is a non-issue. Another issue is for positions closer to frontSegs than backSegs, projecting back to them can become wildy
   * inaccurate to where particles would actually be pushed. Potentially a better algorithm for the shader would be as follows:
   * Find the closest point on backSegs, then the corresponding point on frontSegs and save that direction vector between the two.
   * Go in that direction from the original position until you run into a point on frontSegs.\
   * This still needs to be examined for issues of it's own.
   */
  moveSegmentGroup(oldTri: Triangle, newTri: Triangle) {
    const scan = new GrahamScan();
    const allTriVerts = [...oldTri, ...newTri];
    scan.setVertices(
      Array.from(Array(allTriVerts.length / 2), (_, i) => {
        return { x: allTriVerts[i * 2], y: allTriVerts[i * 2 + 1] };
      })
    );
    const hull = scan.generateHull();
    // console.log(hull);

    const oldTriC: Vec2 = [
      oldTri.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b) / 3,
      oldTri.filter((_, i) => i % 2 === 1).reduce((a, b) => a + b) / 3,
    ];
    const newTriC: Vec2 = [
      newTri.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b) / 3,
      newTri.filter((_, i) => i % 2 === 1).reduce((a, b) => a + b) / 3,
    ];
    const oldTriN = <Triangle>(
      Array.from(Array(6), (_, i) => oldTri[i] - oldTriC[i % 2])
    );
    const newTriN = <Triangle>(
      Array.from(Array(6), (_, i) => newTri[i] - newTriC[i % 2])
    );

    // const ccw = (v1: Vec2, v2: Vec2, v3: Vec2) => (v2[0] - v1[0]) * (v3[1] - v1[1]) - (v3[0] - v1[0]) * (v2[1] - v1[1]) > 0
    const ccw = (t: Triangle) =>
      (t[2] - t[0]) * (t[5] - t[1]) - (t[4] - t[0]) * (t[3] - t[1]) > 0;

    const oldTriCCW = ccw(oldTriN);
    const newTriCCW = ccw(newTriN);
    const perms =
      oldTriCCW !== newTriCCW
        ? [
            [2, 1, 0],
            [1, 0, 2],
            [0, 2, 1],
          ]
        : [
            [0, 1, 2],
            [1, 2, 0],
            [2, 0, 1],
          ];

    const permuteTri = (t: Triangle, perm: number[]) =>
      Array.from(Array(t.length), (_, i) => t[perm[i]]);

    let bestScore = 0;
    let bestK = 0;
    for (let k = 0; k < 3; k++) {
      const perm = perms[k];
      const permTri = permuteTri(oldTriN, perm);
      const score = newTriN
        .map((v, i) => (v - permTri[i]) ** 2)
        .reduce((a, b) => a + b);
      if (k === 0 || score < bestScore) {
        bestScore = score;
        bestK = k;
      }
    }
    const bestPerm = perms[bestK];

    // determine line segments of newTri that are part of the frontier
    //  (i.e. are part of the convex hull)
    const newTri_ = Array.from(Array(3), (_, i) => {
      return { x: newTri[i * 2], y: newTri[i * 2 + 1], i };
    });

    const frontSegs: Segment[] = [];
    const backSegs: Segment[] = [];
    for (let i = 0; i < hull.length; i++) {
      const v1 = hull[i];
      const v2 = hull[(i + 1) % hull.length];

      const v1i = newTri_.filter((v) => v1.x === v.x && v1.y === v.y)?.[0]?.i;
      if (v1i === undefined) continue;

      const v2i = newTri_.filter((v) => v2.x === v.x && v2.y === v.y)?.[0]?.i;
      if (v2i === undefined) continue;

      frontSegs.push([v1.x, v1.y, v2.x, v2.y]);
      // prettier-ignore
      backSegs.push([oldTri[bestPerm[v1i] * 2], oldTri[bestPerm[v1i] * 2 + 1], oldTri[bestPerm[v2i] * 2], oldTri[bestPerm[v2i] * 2 + 1]])
    }

    const hullFlat = hull.flatMap((v) => [v.x, v.y]);
    if (hull.length < 6) hullFlat.push(NUL, 0);
    this.movegpuc.updateUniform("areaVerts", hullFlat);
    if (backSegs.length < 3) backSegs.push([NUL, 0, 0, 0]);
    this.movegpuc.updateUniform("preSegs", backSegs.flat());
    if (frontSegs.length < 3) frontSegs.push([NUL, 0, 0, 0]);
    this.movegpuc.updateUniform("postSegs", frontSegs.flat());

    // console.log(backSegs, frontSegs);

    this.movegpuc.updateUniform("oldScale", this.scale);
    this.movegpuc.updateUniform("oldTranslate", this.translate);

    const vertsX_ = newTri_.map((v) => v.x);
    const vertsY_ = newTri_.map((v) => v.y);
    this.updateCenterScale(vertsX_, vertsY_, true);

    this.movegpuc.updateUniform("SDF", this.texture);
    this.movegpuc.updateUniform("NUL", NUL);

    this.texture = this.movegpuc.compute(true)!;
    return this.movegpuc.renderTarget.texture;
  }

  getSize(): [w: number, h: number] {
    return [this.width, this.height];
  }
}

class SDFIsInitialized extends SDF {
  declare bounds: LineSegmentsReference;
  declare segmentNormals: boolean[][];
  declare scale: Vec2;
  declare translate: Vec2;
}
