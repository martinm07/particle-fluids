# v1.3.0

### General:

- Add new optional field to FluidVisual "invTransform", which is used to house the inverse transformation of the transform field on that object.
- Factor intermediate developer debugging/testing code from "script.ts" into a new file "devtesting.ts", which is called seperately in "index.html".

### In `boundsHelper.ts`:

- Fix flaw in trianglesToLineSegments(), which meant that large segments passing through multiple already laid-down solids wouldn't properly adjust to all the intersections.
- In cleanupLineSegments(), remove an unnecessary random permutation that was applied to the input.
- Make the second argument ("normals") in cleanupLineSegments() optional.

### In `ParticleRender.ts`:

- Add the relativeLineBounds() method, which translates percentages of the canvas height/width into coordinates in the simulation space, from the perspective of one of the FluidVisuals (i.e. so that after the transform and translate the bounds ends up in the expected places), which is helpful for trying to fit one in the canvas, and building the rest off of that.

### In `helper.ts`:

- Add the functions applyTransform() and inverseTransform() which apply a linear transformation to a 2D vector, and calculate the inverse of a 2x2 matrix, respectively.

# v1.2.0

### General:

- Add "visuals/FluidVisuals.ts", which most importantly exports the "FluidVisual" interface, with "transform", "translate" and "particleVisual" as fields. This replaces fields such as "copies", "translate", "rotation" and "flipped" that were on CanvasVisual, with copies now being a list of FluidVisuals, and translate/rotation/flipped being compressed into a single linear transformation 2x2 matrix.
  The new structure for describing visuals is; CanvasVisual has multiple FluidVisuals attached, each of which has one ParticleVisual attached.

### In `helper.ts`:

- Add the type "Transformation", which describes a linear transformation in 2D space (i.e. a 2x2 matrix flattened into a list of length 4)

### In `ParticleRender.ts`:

- Remove FRUSTUM_SIZE from the params
- Change SCALE to the Vec2 EDGE_POINT in params, which now is used in the updateSize() method to change the scale of particleMesh so that this coordinate in simulation space lies on the edge of the canvas.
- Make shaderCode variable refresh back to the original after every iteration for fluidCopies in the constructor, since now each copy may have a different particleVisual object attached.
- Add fluidVisual.translate and fluidVisual.transform to particleMesh as uniforms, to be used by the vertex shader.
- Remove particleVisual as argument for constructor(), since all we now need is canvasVisual.

### In `vertex-shader.glsl`:

- Remove the uniforms pixelScale and offset, and add transform and translate, which are applied to the pos as transform \* pos + translate. We do this here instead of on the particleMesh itself in (Three)JS because we don't want it to affect ParticleVisual (e.g. stretching the particle circles into ovals), only the positions of the particles.

# v1.1.0

### General:

- Add extra dependency "graham_scan". This is an algorithm that finds the convex hull of a set of vertices.
- Add button toggling the visibility of the simulation parameter sliders.
- Add `boundsHelper.ts`, which mainly exposes the function trianglesToLineSegments(), processing a list of triangles into a list of line segments, such that every point on every line segment is on the boundary of inside to outside.
- Add `sdf.ts`, which exposes the SDF class, handling the creation and updates to a texture which constitutes a Signed Distance Field of the provided solid objects.
- Add `create-sdf.glsl` and `move-segments-sdf.glsl`.

### In `Algorithm.ts`:

- Change lineBounds argument in init() to "bounds"; a list of triangles.
- Use the new trianglesToLineSegments function within init()
- Use the new SDF class within init()
- Add texInput "SDF" and uniforms "SDFTranslate", and "SDFscale" to GPUC5
- Add the lifecycle of bounds updates to step(), i.e. 1) Consume the difference between bounds and newBounds, 2) have GPUC5 consume the SDF, 3) set bounds <- newBounds, and 4) reconstruct the SDF using (new)bounds, if necessary
- Add public method updateBounds(), and private method consumeNewBoundsDifference()

### In `GPUCompute.ts`:

- Add an optional "options" argument to the constructor, which is an object that defines format and/or type of the ensuing renderTarget.
- Add option to specify width and height instead of numComputes to constructor.

### In `helper.ts`:

- Add the types "Triangle" (a flat list of x/y coordinates for 3 vertices), "SolidObjs" (a list of Triangles), and "Segment" (a flat list of x/y coordinates for 2 vertices).
- Add the functions trianglesEqual() (checking geometric equality of two triangles), visualiseTexture() (creating a new renderer to render to a new canvas), generateRandomInds() and permute().

### In `ParticleRender.ts`:

- Remove the option of changing FRUSTUM_SIZE, opting for the sensible default of 1.
- Remove renderer.setPixelRatio() calls and factor pixelRatio out into a class variable, which is used by the updateSize() method.
- Force a call to updateSize() on the first time render() is called.

### In `compute-shader-5.glsl`:

- Remove logic in collision detection and response for handling particles that intersect through the space between the boundary margin and the boundary itself (approaching from one of the ends of the segment). This won't be needed as we utilise the SDF to cover such blind spots.
