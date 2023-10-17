import * as THREE from "three";
import { Vec2 } from "../helper";

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

export interface CanvasVisual {
  backgroundColor: aColor;
  pixelScale: number;
  copies: number;
  translate: Vec2 | Vec2[];
  rotation: number | number[];
  flipped: [x: boolean, y: boolean] | [x: boolean, y: boolean][];
  framesBetween: number;
}

export const DefaultCanvas: CanvasVisual = {
  backgroundColor: new aColor(0xffffff, 1),
  pixelScale: 4,
  translate: [0, 0],
  copies: 1,
  rotation: 0,
  flipped: [false, false],
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
