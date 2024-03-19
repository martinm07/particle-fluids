The solid objects will consist of a composition of triangles. They will be provided as such by the user, as a list of 6-length tuples (3 x/y coordinates). This list goes through two separate pipelines; the line segments algorithm, and the signed distance field (SDF) algorithm. These two work together in GPUC5 to make the complete boundary detection and response algorithm. Specifically, the line segments algorithm covers all cases where the particle started outside an object, but is trying to update its position into/past one (which is most common). The SDF algorithm is used when the particle seems to have started inside an object, which may come about due to numerical error, or when the objects themselves move.

# Line Segments Algorithm

## Translating from triangles to line segments

Firstly, from the triangles provided by the user, we should optimize to cull line segments that are inside the apparent shapes being constructed. For example, a square may be seen as
```
[
	[0.0, 0.0, 1.0, 0.0, 1.0, 1.0],
	[0.0, 0.0, 0.0, 1.0, 1.0, 1.0],
]
```
which translates to the line segments
```
[
	[0.0, 0.0, 1.0, 0.0],
	[1.0, 0.0, 1.0, 1.0],
	[1.0, 1.0, 0.0, 0.0],
	[0.0, 0.0, 0.0, 1.0],
	[0.0, 1.0, 1.0, 1.0],
	[1.0, 1.0, 0.0, 0.0]
]
```
. We see that there are duplicates (line 3 and 6), and what we should sense is that for triangles to ever come together to make a bigger shape, they need to share sides, and so by removing duplicates (completely) we remove many interior line segments. In cases where triangles overlap, line segments will extend into the interior of shapes, but there won't be any segments completely contained inside. We could still redefine line segments to stop at intersections, but it would be unnecessary overhead (*hahahahha....*).
Thus the translation is as follows:
```python
# Note that, in object representation, [vi -- vj] == [vj -- vi]
for [v1, v2, v3] of user_input:
	# If the whole triangle is a duplicate, skip
	if [v1 -- v2] and [v2 -- v3] and [v3 -- v1] in out_segments:
		continue
	for 3 iterations:
		line segment = [v1 -- v2], then [v2 -- v3], and finally [v3 -- v1]
		if line segment in out_segments:
			append line segment to blacklist
			remove line segment from out_segments
		else if line segment not in out_segments and not in blacklist:
			append line segment to out_segments
```

## Calculating slope and y-intercept from two points

Classically, the function for a line is
$$
y = mx + b
$$
and so if you have two points $(x_1, y_1)$ and $(x_2, y_2)$, the slope comes easily as
$$
m = \frac{y_1 - y_2}{x_1 - x_2}
$$
and the y-intercept comes from the difference between $mx_1$ and what the output "should" be, $y_1$ (or $x_2$ and $y_2$):
$$
b = y_1 - mx_1
$$
The problem here is the slope's bound on infinity as we try to describe a more vertical line, as $x_1 - x_2$ tends towards 0. To address this we strategically swap between being a "function of $x$" and being a "function of $y$", where
$$
x = my + b
$$
. Specifically, we always choose which one gives a smaller absolute value for $m$, which is given by
$$
L = \begin{cases}
y = mx + b && \text{if } \left\vert y_1 - y_2\right\vert < \left\vert x_1 - x_2\right\vert \\
x = my + b && \text{else}
\end{cases}
$$
. With this, $m$ is bound to the interval $[-1, 1]$. Finding $m$ and $b$ in a function of $y$ is as simple as swapping the $y$ s and the $x$ s in the above equations.

## Calculating the intersection of two lines

We will have two lines, one being a particle's previous position to it's current position, and another being a line segment boundary. We'll call these $L_1$ and $L_2$, and because of the above, there are four possibilities for the system of equations we'll need to solve:
1. $L_1$ is a function of $x$, $L_2$ is a function of $x$
2. $L_1$ is a function of $y$, $L_2$ is a function of $x$
3. $L_1$ is a function of $x$, $L_2$ is a function of $y$
4. $L_1$ is a function of $y$, $L_2$ is a function of $y$

Cases 1 and 4, 2 and 3 are highly related, being one substitution of $y$ for $x$, $x$ for $y$ away from each other. That being said, I'll show the solutions for cases 1 and 3 here, starting with case 1:
$$
\begin{align}
y = m_1x + b_1 \\
y = m_2x + b_2
\end{align}
$$
$$
\begin{align}
m_1x + b_1 &= m_2x + b_2 \\
(m_1 - m_2)x &= b_2 - b_1 \\
x &= \frac{b_2 - b_1}{m_1 - m_2}
\end{align}
$$
$$
\begin{align}
y &= m_1\frac{b_2 - b_1}{m_1 - m_2} + b_1 \\
 &= \frac{m_1b_2 - m_1b_1 + (b_1m_1 - b_1m_2)}{m_1 - m_2} \\
 &= \frac{m_1b_2 - m_2b_1}{m_1 - m_2}
\end{align}
$$
And here's case 3:
$$
\begin{align}
y = m_1x + b_1 \\
x = m_2y + b_2
\end{align}
$$
$$
\begin{align}
x &= m_2(m_1x + b_1) + b_2 \\
(1-m_1m_2)x &= m_2b_1 + b_2 \\
x &= \frac{b_2 + m_2b_1}{1 - m_1m_2}
\end{align}
$$
$$
\begin{align}
y &= m_1\frac{b_2 + m_2b_1}{1 - m_1m_2} + b_1 \\
&= \frac{m_1b_2 + m_1m_2b_1 + (b_1 - m_1m_2b_1)}{1 - m_1m_2} \\
&= \frac{b_1 + m_1b_2}{1 - m_1m_2}
\end{align}
$$
With this, we'll call the intersection point $I_p = (x^\prime, y^\prime)$. When we loop across every boundary line segment, if we determine that the particle did actually violate it, then we'll adjust its position to $I_p$.

# Signed Distance Field

To generate an SDF, we need to rasterize the triangles into an "image" of some specified resolution, with a scale and translation that can be used to map particle positions to image coordinates. The edges of this image are not treated as borders, but that if a particle is past them it needn't concern itself with boundary violations at all.
\[TBC\]