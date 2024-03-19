## The Goal of a Fluid Simulation Algorithm:
Have a big collection of particles, which is updated in fixed time steps, yet nonetheless behaves similarly to there being infinite infinitesimally small time steps, and each particle is updated *simultaneously* using only the spatially local information of itself and other particles, such that:
- The theoretical density of the fluid remains constant (?)

Space will be divided into "fluid," where density remains constant and "not fluid," which has its own density that the fluid simulation is unconcerned with. If non-fluid space with a lower density than the fluid finds fluid above it, then what could be nice is if it replaces that fluid (essentially, bubbles of air moving to escape water).
We don't express the "fluid space" explicitly, but rather implicitly through the particles it's made up of.

---

- Estimate with honest confidence where the fluid space begins and ends from the particles
- Find the closest *even* distribution of particles to the current distribution, map particles from one to the other and move them.

We of course can't actually do anything like the above, since each particle should find it's new position independently using local information, however perhaps an approximation of this is what we should strive for.

![[custom-alg-1.png]]

**This doesn't have a good representation of the internals of the fluid, but this is an interesting potential tradeoff to me**
\[TBC\]