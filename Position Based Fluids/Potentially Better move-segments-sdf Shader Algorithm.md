The current algorithm is finding the frontier, finding the line segments that map to the frontier, project the point's position onto the closest point on those line segments and translating it percentage-wise to the frontier. For example, this is what it would do in the example below:
![[current-move-sdf-behaviour.png]]
This obviously doesn't make much sense; clearly the particle should have only lateral movement, like the line segment itself. Thus, here is the proposed new algorithm:

> Find the closest point on the line segments that map to the frontier, then the corresponding point on the frontier (again, a percentage-wise translation), and save that direction vector. Go in that direction from the point's position until you run into a point on the frontier.

![[new-move-sdf-behaviour.png]]
Note that the behaviour of this algorithm approaches that of the original as the point gets closer to that which it's being projected onto, and less as it gets closer to the frontier (where it likely wouldn't be adjusted much at all, running into the frontier right away).