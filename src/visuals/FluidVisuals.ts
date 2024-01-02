import { Transformation, Vec2 } from "../helper";
import { BlueCircleParticle, ParticleVisual } from "./ParticleVisuals";

export interface FluidVisual {
  transform: Transformation;
  translate: Vec2;
  particleVisual: ParticleVisual;
  // This is useful to store rather than recompute (potentially) every frame
  invTransform?: Transformation;
}

export const DefaultFluid: FluidVisual = {
  transform: [1, 0, 0, 1],
  translate: [0, 0],
  particleVisual: BlueCircleParticle,
};
