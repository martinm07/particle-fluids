import {
  adjustLineSegmentsIntersection,
  basicTrianglesToLineSegments,
  findNormal,
  isInsideSolid,
  segDistance,
  triangleContainsSegment,
  trianglesToLineSegments,
} from "./boundsHelper";
import { SolidObjs, visualiseTexture } from "./helper";
import { visualiseBounds } from "./script";
import { SDF } from "./sdf";

const boundsTest: SolidObjs = [
  // [0, 0, 1, 0, 1, 1],
  // [0, 0, 0, 1, 1, 1],

  // [-28, -20, 28, -20, 28, -24],
  // [-28, -20, -28, -24, 28, -24],

  [-1, 1, 1, 1, 0, -0.5],
  [-1, -1, 1, -1, 0, 0.5],
  [-0.333, 0.75, 0.333, 0.75, 0.2, 1.3],
  // [-1, -1, 1, -1, 0, -0.5],

  // [-1, 0, 1, 0, 0, 1],
  [-0.5, 0, 0.5, 0, 0, -1],

  // [0, 0, 0, 1, 1, 1],
  // [0, 0, 1, 0, 1, 1],
  // [0, 0, 1, 0, 1, -1],
  // [0, 0, 0, -1, 1, -1],
  // [0, 0, 0, -1, -1, -1],
  // [0, 0, -1, 0, -1, -1],
  // [0, 0, -1, 0, -1, 1],
  // [0, 0, 0, 1, -1, 1],

  // [0.5, -0.5, 1, 0.5, 0.5, 0.5],
  // [0.5, -0.5, 1, -0.5, 1, 0.5],
  // [1, -0.5, 1, -1, -0.5, -0.5],
  // [-0.5, -1, -0.5, -0.5, 1, -1],
  // [-1, -1, -1, 0.5, -0.5, -1],
  // [-0.5, -1, -0.5, 0.5, -1, 0.5],
];

console.log(findNormal([-1, -1], [-1 / 3, 0], [1, -1]));
console.log(
  adjustLineSegmentsIntersection(
    [1 / 3, 0],
    [-0.5, 0, 0.5, 0],
    true,
    [1, -1, 1 / 3, 0],
    false
  )
);
console.log(
  triangleContainsSegment([1, -0.5, 1, -1, -0.5, -0.5], [0.5, -0.5, 1, -0.5])
);
console.log(segDistance([0.5, -0.5, 1, 0.5], [0.75, 0]));
console.log(
  isInsideSolid(
    [-0.75, -0.25],
    [
      [1, 0.5, 0.5, 0.5],
      [1, -0.5, 1, 0.5],
      [-0.5, -0.5, 0.5, -0.5],
      [0.5, 0.5, 0.5, -0.5],
      [1, -0.5, 1, -1],
      [-0.5, -1, -0.5, -0.5],
      [1, -1, -0.5, -1],
      [-1, -1, -1, 0.5],
      [-1, 0.5, -0.5, -1],
      [-0.5, -1, -1, -1],
    ],
    [false, false, true, false, true, true, true, true, true, true]
  )
);

// const segmentsTestNest = trianglesToLineSegments(boundsTest, {
//   triangleRef: true,
// });
// console.log(segmentsTestNest);
// const segmentsTest = basicTrianglesToLineSegments(boundsTest);
// const segmentsTest = segmentsTestNest.flat();

// setTimeout(visualiseBounds.bind(null, segmentsTest, 0.25));

/////////// VISUALISE SDF
const canvasContainer = document.getElementById("test-container")!;
const vizSDF = () => {
  const boundsTest: SolidObjs = [
    [0, 0, 1, 0, 1, -0.1],
    [0, 0, 0, 1, -0.1, 1],
    [1, 0, 1, 1, 1.1, 1],
  ];
  const [lineBounds, segmentNormals] = trianglesToLineSegments(boundsTest, {
    normals: true,
    triangleRef: true,
  });
  console.log(lineBounds, segmentNormals);
  // setTimeout(visualiseBounds.bind(null, lineBounds, 0.25));

  visualiseTexture(
    canvasContainer,
    (renderer) => {
      const sdf = new SDF(renderer, {
        width: 200,
        height: 200,
        boundaryMargin: 0.05,
      });
      sdf.returnSDF(lineBounds, segmentNormals);
      setTimeout(visualiseBounds.bind(null, lineBounds, 0.3));

      // Move triange at index 2
      // const allSegs = trianglesToLineSegments(
      //   [[-0.333, 0.75, 0.333, 0.75, -0.5, 2]],
      //   {
      //     triangleRef: true,
      //     prefillLineSegs: lineBounds,
      //     prefillLineSegsNorms: segmentNormals,
      //     verbose: true,
      //   }
      // );
      // setTimeout(visualiseBounds.bind(null, allSegs, 0.25));
      // const newTri = allSegs[allSegs.length - 1];
      // console.log(newTri, allSegs);
      // sdf.moveSegmentGroup(2, newTri);

      // Read data (it's possible to read floating-point textures??)
      // const buffer = new Float32Array(200 * 200 * 4);
      // renderer.readRenderTargetPixels(
      //   sdf.movegpuc.renderTarget,
      //   0,
      //   0,
      //   200,
      //   200,
      //   buffer
      // );
      // console.log(buffer);

      const tex = sdf.returnSDF();
      const [width, height] = sdf.getSize();
      return [tex, width, height];
    },
    `uniform sampler2D tex;

    void main() {
        float index = 0.0 + (gl_FragCoord.x - 0.5) + (gl_FragCoord.y - 0.5) * resolution.x;

        vec2 uv = gl_FragCoord.xy / resolution.xy;
        vec4 info = texture2D(tex, uv).xyzw;

        float max = 1.0;
        info.x = pow(1.0 + info.x, 7.0) - 1.0;
        if (info.x < 0.0) gl_FragColor = vec4(-info.x / max, 0.0, 0.0, 1.0);
        else gl_FragColor  = vec4(0.0, 0.0, info.x / max, 1.0);
    }`
  );
};
setTimeout(vizSDF);
