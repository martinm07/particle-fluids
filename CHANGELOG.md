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
