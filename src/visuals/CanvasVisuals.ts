import * as THREE from "three";

export class aColor {
  color: THREE.Color;
  alpha: number;

  constructor(c1: THREE.Color, c2: number);
  constructor(c1: number, c2: number);
  constructor(c1: number, c2: number, c3: number, c4: number);
  constructor(c1: THREE.Color | number, c2: number, c3?: number, c4?: number) {
    if (c1 instanceof THREE.Color) {
      this.color = c1;
      this.alpha = c2;
    } else {
      if (c4 == null) {
        this.color = new THREE.Color(c1);
        this.alpha = c2;
      } else {
        this.color = new THREE.Color(c1, c2, c3!);
        this.alpha = c4!;
      }
    }
  }
}

type Vec2 = [x: number, y: number];
export class BoundingBox {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;

  constructor(p1: Vec2, p2: Vec2);
  constructor(p1: number, p2: number, p3: number, p4: number);
  constructor(p1: number | Vec2, p2: number | Vec2, p3?: number, p4?: number) {
    if (typeof p1 === "number") {
      this.top = p1;
      if (typeof p2 === "number") this.right = p2;
      this.bottom = p3!;
      this.left = p4!;
    } else if (typeof p2 !== "number") {
      this.left = Math.min(p1[0], p2[0]);
      this.right = Math.max(p1[0], p2[0]);
      this.bottom = Math.min(p1[1], p2[1]);
      this.top = Math.max(p1[1], p2[1]);
    }
  }
}

export interface CanvasVisual {
  backgroundColor: aColor;
  pixelScale: number;
  copies: number;
  translate: Vec2 | Vec2[];
  rotation: number | number[];
  flipped: [x: boolean, y: boolean] | [x: boolean, y: boolean][];
  crop?: BoundingBox | BoundingBox[];
  framesBetween: number;
}

export const DefaultCanvas: CanvasVisual = {
  backgroundColor: new aColor(0xffffff, 1),
  pixelScale: 4,
  translate: [0, 0],
  copies: 1,
  rotation: 0,
  flipped: [false, false],
  crop: new BoundingBox(NaN, NaN, 20, NaN),
  framesBetween: 0,
};

export const MirrorCanvas: CanvasVisual = {
  backgroundColor: new aColor(0xffffff, 1),
  pixelScale: 4,
  translate: [0, 20],
  copies: 2,
  rotation: 0,
  flipped: [
    [false, false],
    [false, true],
  ],
  framesBetween: 0,
};
