import { ParticleRender } from "./ParticleRender";
import { Algorithm } from "./Algorithm";
import { DefaultCanvas } from "./visuals/CanvasVisuals";
import { BlueCircleParticle } from "./visuals/ParticleVisuals";

export { ParticleRender, Algorithm, DefaultCanvas, BlueCircleParticle };

/*
`ParticleRender` sets up a renderer, scene etc. that's the building blocks for all further visualisation techniques.
`Algorithm` sets up number of particles, their starting positions, and line bounds, and is invoked to make the computations
  that underlie everything else.
ParticleRender, upon initilization, also takes various "Visuals" objects, which contain properties that alter the presentation.
  Namely, CanvasVisuals, and ParticleVisuals (though more may be added later e.g. NeighbourVisuals, CloudVisuals, etc.).
CanvasVisuals has properties for copies, rotations, masks and time dilation of the overall ParticleRender window.
ParticleVisuals has properties for color, size and shape. These may either be constant, or dynamic, in which case the user must
  provide functions that take in particle position, velocity, cursor position and/or time and output (for example) a color.
  We may also want to depend on a particle's neighbour list, or all particles' positions and velocities in the simulation.
  For the latter case, what realistically provides all the functionality we need is the user also providing some mapping function
  that maps position and velocity to 1 number. Then we sort these numbers and give the current particle's place in the sort,
  which can be handled as necessary to produce the final color (for example).

There will also be provided Presets to all Visuals, as well as simulation parameters.
*/
