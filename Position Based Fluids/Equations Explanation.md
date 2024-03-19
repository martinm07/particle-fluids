
$$
\begin{align}
C_i(\mathbf p_1, ..., \mathbf p_n) = \frac{1}{\rho_0}\sum_jW(\mathbf p_i - \mathbf p_j) - 1 \tag 1
\end{align}
$$
$$
\begin{align}
\nabla_{\mathbf p_k}C_i = \frac{1}{\rho_0} \begin{cases}
\sum_j \nabla_{\mathbf p_k}W(\mathbf p_i - \mathbf p_j)& \text{if }k=i\\
-\nabla_{\mathbf p_k}W(\mathbf p_i - \mathbf p_j) & \text{if }k=j
\end{cases}
\end{align} \tag 2
$$
$$
\begin{align}
\lambda_i = -\frac{C_i(\mathbf p_1, ..., \mathbf p_n)}{\sum_k \left\vert \nabla_{\mathbf p_k}C_i\right\vert^2 + \epsilon}
\end{align} \tag 3
$$
$$
\begin{align}
s_\text{corr} = -k\left(\frac{W(\mathbf p_i - \mathbf p_j)}{W(\Delta \mathbf q)}\right)^n
\end{align} \tag 4
$$
$$
\begin{align}
\Delta \mathbf p_i = \frac{1}{\rho_0} \sum_j(\lambda_i + \lambda_j + s_\text{corr})\nabla W(\mathbf p_i - \mathbf p_j)
\end{align} \tag 5
$$
$$
\begin{align}
\omega_i = \sum_j \mathbf v_{ij} \times \nabla_{\mathbf p_j}W(\mathbf p_i - \mathbf p_j) \text{ where } \mathbf v_{ij} = \mathbf v_j - \mathbf v_i
\end{align} \tag 6
$$
$$
\begin{align}
\mathbf f_i^\text{vorticity} = \epsilon\left(\mathbf N \times \omega_i\right) \text{ where } \mathbf N = \frac{\eta}{\vert \eta \vert} \text{ and } \eta = \nabla\vert\omega\vert_i
\end{align} \tag 7
$$
$$
\begin{align}
\mathbf v_i^\text{new} = \mathbf v_i + c\sum_j \mathbf v_{ij} \cdot W(\mathbf p_i - \mathbf p_j)
\end{align} \tag 8
$$
$C_i$ is the constraint on the $i$th particle in the simulation. The goal is to create a fluid, and you can't really squish a fluid "into" itself, which we describe by saying it's *incompressible*. This is what the constraint enforces, saying the particle would like to remain at a rest density, $\rho_0$, which is estimated using a kernel function and the distances between it and its nearest neighbours (a summation over $j$ will always be iterating over the neighbours of particle $i$-  $\mathbf p_i$). The kernel function will typically look something like a Gaussian distribution, simply saying that closer particles means more density, but of course the function we choose will impact the behaviour of the fluid.  "Poly6" will be the star of the show here, being $W^\text{poly6} = \frac{315}{64\pi h^9}\left(h^2 - r^2\right)^3$. Note that $h$ is the "kernel width", describing the radius of influence for particles upon each other, and $r$ will be the distance between two particles, specifically between particle $i$ and its neighbour, $\mathbf p_j$, or $r=\Vert\mathbf p_i - \mathbf p_j\Vert$. The constraint is satisfied when it equals $0$.
Thus, the goal is to find a $\Delta \mathbf p$ such that
$$
C(\mathbf p + \Delta \mathbf p) = 0
$$
. Of course it's not so easy to just solve for $\Delta \mathbf p$, and so as part of the general position-based dynamics method, we use a linear approximation of our function. This takes the form of the following:
$$
L_f(x) = f(x_0) + \nabla f(x_0) \cdot (x-x_0)
$$

This is clearly a line (or plane in multi-dimensions), with slope $\nabla f(x_0)$ and y-intercept $f(x_0) - x_0\nabla f(x_0)$. Then, you can prove that this line approximates $f(x)$ at point $x_0$, since when $x = x_0$, $L_f(x) = f(x)$:
$$
L_f(x_0) = f(x_0) + \nabla f(x_0) \cdot (x_0 - x_0) = f(x_0)
$$

Back to the problem at hand, we can create a linear approximation centred at point $\mathbf p$, and evaluate at $\mathbf p + \Delta \mathbf p$:
$$
C(\mathbf p + \Delta \mathbf p) \approx C(\mathbf p) + \nabla C^T\Delta \mathbf p = 0
$$

We have made a small leap to the multi-dimensional here, since $\mathbf p$ is a vector, we're performing a dot product to collect the related terms and add them together- still though, it's the same underlying idea. Other than that, the hope is that $\Delta \mathbf p$ is sufficiently small, so this approximation is close enough.
From here, it *would* be pretty trivial to solve for $\Delta \mathbf p$: $-\frac{C_i(\mathbf p_1, \dots, \mathbf p_n)}{\nabla_{\mathbf p_i}C_i}$, and this in fact looks exactly like *Newton's method*, which is an iterative algorithm for finding the roots of a function:
$$
x_{n+1} = x_n - {f(x_n) \over f'(x_n)}
$$

What this does is get the tangent line at point $x_n$ along the function, find the root *of that line*, and set that equal to the new point, now (ideally) closer to a true root of the function.

However, ultimately *we do not do this*. Instead, we make an additional assumption that $\Delta \mathbf p$ will lie on some point of the line spanned by the vector $\nabla C(\mathbf p)$, which we can interpret as pointing in the direction of steepest ascent for our constraint:
$$
\Delta \mathbf p \approx \nabla C(\mathbf p)\lambda
$$

Now, $\lambda$ is the *constant* we need to find, instead of finding the vector $\Delta \mathbf p$. When substituting this in and solving, we get
$$
C(\mathbf p + \Delta \mathbf p) \approx C(\mathbf p) + \nabla C^T \nabla C\lambda = 0
$$

$$
\lambda = -\frac{C(\mathbf p)}{\nabla C^T\nabla C}
$$

. To un-vectorize this expression, we'll say that for particle $\mathbf p_i$,
$$
\lambda_i = -\frac{C_i(\mathbf p_1, \dots, \mathbf p_n)}{\sum_k \left\vert \nabla_{\mathbf p_k}C_i\right\vert^2}
$$
where $\mathbf p_k$ is iterating through the set of all particles neighbouring $\mathbf p_i$ (i.e. $\mathbf p_j$), and $\mathbf p_i$ itself. This shows that $\nabla C$ was a vector of partial differentials w.r.t. all the inputs of $C_i$ respectively. This *is* what the gradient of a multivariable function is, but what does it mean?
\[TBC\]