- Find the surface normal
- Find the angle between it and $\hat i$
- Apply the rotation matrix to the particle's velocity
- Reverse the $x$ component of the velocity (i.e. multiply by $-1$)
- Apply the inverse of the rotation matrix

To rotate a vector anticlockwise by $\theta$ degrees, use the transformation matrix:
$$
\begin{bmatrix}\cos(\theta) & -\sin(\theta) \\ \sin(\theta) & \cos(\theta)\end{bmatrix}
$$

To rotate a vector clockwise, it's
$$
\begin{bmatrix}\cos(-\theta) & -\sin(-\theta) \\ \sin(-\theta) & \cos(-\theta)\end{bmatrix} = \begin{bmatrix}\cos(\theta) & \sin(\theta) \\ -\sin(\theta) & \cos(\theta)\end{bmatrix}
$$

. In order to reverse the x-component of a vector, use the identity matrix but with $-\hat i$, like this:
$$
\begin{bmatrix}-1 & 0 \\ 0 & 1\end{bmatrix}
$$

Thus, the total composition of transformations we want is:
$$
\begin{bmatrix}\cos(\theta) & -\sin(\theta) \\ \sin(\theta) & \cos(\theta)\end{bmatrix} \begin{bmatrix}-1 & 0 \\ 0 & 1\end{bmatrix} \begin{bmatrix}\cos(\theta) & \sin(\theta) \\ -\sin(\theta) & \cos(\theta)\end{bmatrix}
$$

To combine them:
$$
\begin{bmatrix}-1 & 0 \\ 0 & 1\end{bmatrix} \begin{bmatrix}\cos(\theta) & \sin(\theta) \\ -\sin(\theta) & \cos(\theta)\end{bmatrix} = \begin{bmatrix}-\cos(\theta) & -\sin(\theta) \\ -\sin(\theta) & \cos(\theta)\end{bmatrix}
$$

$$
\begin{align*}
\begin{bmatrix}\cos(\theta) & -\sin(\theta) \\ \sin(\theta) & \cos(\theta)\end{bmatrix} \begin{bmatrix}-\cos(\theta) & -\sin(\theta) \\ -\sin(\theta) & \cos(\theta)\end{bmatrix} &= \begin{bmatrix} \sin^2(\theta) - \cos^2(\theta) & -2\sin(\theta)\cos(\theta) \\ -2\sin(\theta)\cos(\theta) & \cos^2(\theta) - \sin^2(\theta)  \end{bmatrix} \\
& = \begin{bmatrix}-\cos(2\theta) & -\sin(2\theta) \\ -\sin(2\theta) & \cos(2\theta)\end{bmatrix}
\end{align*}
$$

