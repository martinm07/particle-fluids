import { Transformation, Vec2 } from "../helper";
import { BlueCircleParticle, ParticleVisual } from "./ParticleVisuals";

export interface FluidVisual {
  transform: Transformation;
  translate: Vec2;
  particleVisual: ParticleVisual;
}

export const DefaultFluid: FluidVisual = {
  transform: [1, 0, 0, 1],
  translate: [0, 0],
  particleVisual: BlueCircleParticle,
};
