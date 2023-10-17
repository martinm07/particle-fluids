# ThreeJS-PBF-Algorithm

Implementing "Position Based Fluids" by M. Macklin et al. using Three.js for GPGPU.

This package is not yet ready for real use. Please check back again in the near future.

# Installation

```
npm i particle-fluids
```

### Example

```typescript
import {
  Algorithm,
  ParticleRender,
  DefaultCanvas,
  BlueCircleParticle,
} from "particle-fluids";

const MAX_NEIGHBOURS = 64;
const N_PARTICLES = 128;

// Make sure this <canvas> element exists in the HTML
const container = document.querySelector<HTMLDivElement>("#scene-container")!;

const lineBounds = [
  [-20, -20, 20, -20],
  [-20, -20, -20, 200],
  [20, -20, 20, 200],
  [-20, 200, 20, 200],
];

const particleRenderer = new ParticleRender(
  container,
  N_PARTICLES,
  BlueCircleParticle,
  DefaultCanvas
);
const sim = new Algorithm(particleRenderer.renderer, { SOLVER_ITERATIONS: 3 });
sim.init(N_PARTICLES, MAX_NEIGHBOURS, lineBounds, (i) => {
  return [(i % 10) - 5, Math.floor(i / 10)];
});

particleRenderer.setParticleStates(sim.positions!, sim.velocities!);
particleRenderer.render();

let debug = false;
let paused = true;
function render() {
  sim.debug = debug;
  sim.step(paused ? 0.0166 : undefined);

  particleRenderer.setParticleStates(sim.positions!, sim.velocities!);
  particleRenderer.render();

  debug = false;
  if (!paused) requestAnimationFrame(render);
}

// Set up button/s to control pause/unpause, etc.
```

Some important CSS:

```css
#scene-container {
  width: 100%;
  height: 100vh;
  position: absolute;
  top: 0;
  z-index: -1;
}

#scene-container canvas {
  width: 100%;
  height: 100%;
}
```
