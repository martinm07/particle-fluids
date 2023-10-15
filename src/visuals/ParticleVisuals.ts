import * as THREE from "three";
import { ParticleShape, CircleShape } from "./ParticleGeometry";

export interface ParticleVisual {
  color: THREE.Color | string;
  size: number | string;
  shape: ParticleShape;
}

// 0.0, 0.5882, 0.8588
export const BlueCircleParticle: ParticleVisual = {
  color: new THREE.Color(0x0096db),
  size: 1,
  shape: new CircleShape(),
};

// BlueCircleParticle.shape.setIndices()
