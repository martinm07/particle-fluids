import * as THREE from "three";
import { DefaultFluid, FluidVisual } from "./FluidVisuals";

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
  fluidCopies: FluidVisual[];
}

export const DefaultCanvas: CanvasVisual = {
  backgroundColor: new aColor(0xffffff, 1),
  fluidCopies: [DefaultFluid],
};
