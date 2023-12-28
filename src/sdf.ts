import * as THREE from "three";
import { GPUCompute } from "./GPUCompute";
import { Vec2, Segment } from "./helper";
import {
  LineSegmentsReference,
  cleanupLineSegments,
  segmentInList,
} from "./boundsHelper";
import ConvexHullGrahamScan from "graham_scan";

import updateSDFShader from "./shaders/create-sdf.glsl";
import moveSegmentSDFShader from "./shaders/move-segments-sdf.glsl";
import moveSegmentsSDFShader2 from "./shaders/_DEPR_move-segments-sdf.glsl";

const NUL = Number.parseFloat(import.meta.env.VITE_NUL);

/*
IMP: First apply this.translate, then this.scale:
(p.x + SDF.translate[0]) * SDF.scale[0],
 p.y + SDF.translate[1]) * SDF.scale[1])
*/
export class SDF {
  width: number;
  height: number;

  bounds?: LineSegmentsReference;
  segmentNormals?: boolean[][];

  texture: THREE.Texture;

  gpuc: GPUCompute;
  movegpuc: GPUCompute;
  scale?: Vec2;
  translate?: Vec2;

  constructor(
    renderer: THREE.WebGLRenderer,
    params: { width: number; height: number } = { width: 200, height: 200 }
  ) {
    this.width = params.width;
    this.height = params.height;

    this.gpuc = new GPUCompute(
      [this.width, this.height],
      updateSDFShader,
      renderer,
      [],
      {
        type: THREE.FloatType,
      }
    );
    this.texture = this.gpuc.renderTarget.texture;

    this.movegpuc = new GPUCompute(
      [this.width, this.height],
      moveSegmentsSDFShader2,
      renderer,
      [],
      {
        type: THREE.FloatType,
      }
    );

    this.movegpuc = new GPUCompute(
      [this.width, this.height],
      moveSegmentSDFShader,
      renderer,
      [],
      {
        type: THREE.FloatType,
      }
    );
  }

  isInitialized(): this is SDFIsInitialized {
    if (this.bounds) return true;
    else return false;
  }

  updateCenterScale(): void;
  updateCenterScale(vertsX: number[], vertsY: number[]): void;
  updateCenterScale(vertsX?: number[], vertsY?: number[]): void {
    if (!this.isInitialized()) return;
    if (this.bounds.length === 0) {
      this.scale = [1, 1];
      this.translate = [0, 0];
    } else {
      const vertsX_ =
        vertsX ?? this.bounds.flat(2).filter((_, i) => i % 2 === 0);
      const vertsY_ =
        vertsY ?? this.bounds.flat(2).filter((_, i) => i % 2 === 1);

      const top = Math.max.apply(null, vertsY_);
      const right = Math.max.apply(null, vertsX_);
      const bottom = Math.min.apply(null, vertsY_);
      const left = Math.min.apply(null, vertsX_);

      // coordinates go from [0.5 -> 199.5, 0.5 -> 199.5]
      //  where (0.5, 0.5) is bottom left
      this.scale = [this.width / (right - left), this.height / (top - bottom)];
      this.translate = [-left, -bottom];
    }

    this.gpuc.updateUniform("scale", this.scale);
    this.gpuc.updateUniform("translate", this.translate);
    this.movegpuc.updateUniform("scale", this.scale);
    this.movegpuc.updateUniform("translate", this.translate);
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
      const [bounds_, normals_] = cleanupLineSegments(
        this.bounds!.flat(),
        this.segmentNormals!.flat()
      );
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

  moveSegmentGroup(id: number, newLoc: Segment[]) {
    if (!this.isInitialized()) return;
    const hull = new ConvexHullGrahamScan();
    for (const [x1, y1, x2, y2] of this.bounds[id]) {
      hull.addPoint(x1, y1);
      hull.addPoint(x2, y2);
    }
    for (const [x1, y1, x2, y2] of newLoc) {
      hull.addPoint(x1, y1);
      hull.addPoint(x2, y2);
    }

    const convexHull: number[] = [];

    const ABinds: { A1?: number; B1?: number; A2?: number; B2?: number } = {};

    let wasLastFrontier: boolean = false; // so ts doesn't complain it "isn't assigned"
    const hull_ = hull.getHull();
    for (const [i, v] of hull_.entries()) {
      convexHull.push(v.x, v.y);
      // Determine if vertex is part of frontier
      // - A line segment of the convex hull is part of the frontier if
      // - - it is part of the new triangle (newLoc)
      // - - it is NOT part of the old triangle
      // - A vertex of the convex hull is part of the frontier if
      //   it is part of a line segment in the frontier
      const seg1: Segment = [
        hull_[i !== 0 ? i - 1 : hull_.length - 1].x,
        hull_[i !== 0 ? i - 1 : hull_.length - 1].y,
        v.x,
        v.y,
      ];
      const seg2: Segment = [
        hull_[i !== hull_.length - 1 ? i + 1 : 0].x,
        hull_[i !== hull_.length - 1 ? i + 1 : 0].y,
        v.x,
        v.y,
      ];
      const inFrontier =
        (segmentInList(seg1, newLoc) &&
          !segmentInList(seg1, this.bounds[id])) ||
        (segmentInList(seg2, newLoc) && !segmentInList(seg2, this.bounds[id]));

      if (i !== 0) {
        if (inFrontier && !wasLastFrontier) {
          ABinds.B2 = i;
          ABinds.B1 = i - 1;
        } else if (!inFrontier && wasLastFrontier) {
          ABinds.A1 = i;
          ABinds.A2 = i - 1;
        }
      }

      wasLastFrontier = inFrontier;
    }
    if (!ABinds.A1) {
      ABinds.A1 = 0;
      ABinds.A2 = hull_.length - 1;
    } else if (!ABinds.B2) {
      ABinds.B2 = 0;
      ABinds.B1 = hull_.length - 1;
    }

    // B1 is always before B2, and A2 is always before A1
    const preBulgeInds = this.AToBInds(
      ABinds.A1!,
      ABinds.B1!,
      hull_.length,
      true
    );
    const postBulgeInds = this.AToBInds(
      ABinds.A2!,
      ABinds.B2!,
      hull_.length,
      false
    );

    const preBulge = preBulgeInds.flatMap((ind) => [
      hull_[ind].x,
      hull_[ind].y,
    ]);
    const postBulge = postBulgeInds.flatMap((ind) => [
      hull_[ind].x,
      hull_[ind].y,
    ]);
    preBulge.push(NUL);
    postBulge.push(NUL);
    // console.log(hull_, ABinds, preBulge, postBulge);

    this.movegpuc.updateUniform("areaVerts", convexHull);
    this.movegpuc.updateUniform("preBulge", preBulge);
    this.movegpuc.updateUniform("postBulge", postBulge);

    this.movegpuc.updateUniform("oldScale", this.scale);
    this.movegpuc.updateUniform("oldTranslate", this.translate);

    const allVerts = [...this.bounds.flat(2), ...newLoc.flat()];
    const vertsX_ = allVerts.filter((_, i) => i % 2 === 0);
    const vertsY_ = allVerts.filter((_, i) => i % 2 === 1);
    this.updateCenterScale(vertsX_, vertsY_);

    this.movegpuc.updateUniform("SDF", this.texture);
    this.movegpuc.updateUniform("NUL", NUL);

    this.texture = this.movegpuc.compute(true)!;
    return this.movegpuc.renderTarget.texture;
  }
}

class SDFIsInitialized extends SDF {
  declare bounds: LineSegmentsReference;
  declare segmentNormals: boolean[][];
  declare scale: Vec2;
  declare translate: Vec2;
}
