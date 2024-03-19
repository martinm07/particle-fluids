// import * as THREE from "three";
import { Algorithm } from "./Algorithm";
import {
  adjustLineSegmentsIntersection,
  basicTrianglesToLineSegments,
  findNormal,
  isInsideSolid,
  isSegContained,
  segDistance,
  triangleContainsSegment,
  trianglesToLineSegments,
} from "./boundsHelper";
import { SolidObjs, visualiseBounds, visualiseTexture } from "./helper";
import { particleRenderer } from "./script";

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
// console.log(
//   isInsideSolid(
//     [-0.75, -0.25],
//     [
//       [1, 0.5, 0.5, 0.5],
//       [1, -0.5, 1, 0.5],
//       [-0.5, -0.5, 0.5, -0.5],
//       [0.5, 0.5, 0.5, -0.5],
//       [1, -0.5, 1, -1],
//       [-0.5, -1, -0.5, -0.5],
//       [1, -1, -0.5, -1],
//       [-1, -1, -1, 0.5],
//       [-1, 0.5, -0.5, -1],
//       [-0.5, -1, -1, -1],
//     ],
//     [false, false, true, false, true, true, true, true, true, true]
//   )
// );
console.log(
  isInsideSolid(
    [12.619090909090911, 31.5],
    [
      [-11.471900826446282, -10.5, 11.471900826446282, -10.5],
      [11.471900826446282, -10.5, 11.471900826446282, -12.6],
      [11.471900826446282, -12.6, -11.471900826446282, -10.5],
      [-11.471900826446282, -10.5, -11.471900826446282, 31.5],
      [-11.471900826446282, 31.5, -13.766280991735538, -10.5],
      [-13.766280991735538, -10.5, -11.471900826446282, -10.5],
    ],
    [true, true, true, false, false, false],
    true
  )
);
// console.log(
//   isSegContained(
//     [11.471900826446282, 31.5, 13.766280991735542, 31.5],
//     true,
//     [
//       [-11.471900826446282, -10.5, 11.471900826446282, -10.5],
//       [11.471900826446282, -10.5, 11.471900826446282, -12.6],
//       [11.471900826446282, -12.6, -11.471900826446282, -10.5],
//       [-11.471900826446282, -10.5, -11.471900826446282, 31.5],
//       [-11.471900826446282, 31.5, -13.766280991735538, -10.5],
//       [-13.766280991735538, -10.5, -11.471900826446282, -10.5],
//     ],
//     [true, true, true, false, false, false]
//   )
// );

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
    [
      -11.471900826446282, -10.5, 11.471900826446282, -10.5, 11.471900826446282,
      -12.6,
    ],
    [
      -11.471900826446282, -10.5, -11.471900826446282, 31.5,
      -13.766280991735538, -10.5,
    ],
    [
      11.471900826446282, -10.5, 11.471900826446282, 31.5, 13.766280991735542,
      31.5,
    ],
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
      console.log("THIS IS THE ONE");
      sdf.returnSDF(lineBounds, segmentNormals);
      setTimeout(
        visualiseBounds.bind(null, particleRenderer, lineBounds, 0.01)
      );

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
// setTimeout(vizSDF);

const algorithmSDF = () => {
  const boundsTest: SolidObjs = [
    [0, 0.8, 1, 0, 1, -0.1],
    // [0, 0, 0, 1, -0.1, 1],
    // [1, 0, 1, 1, 1.1, 1],
  ];
  const boundsTest2: SolidObjs = [
    [0, 1, 1, 0.2, 1, 0.1],
    // [0, 0, 1, 0, 1, -0.1],

    // [0, 0, 0, 1, -0.1, 1],
    // [1, 0, 1, 1, 1.1, 1],
  ];
  visualiseTexture(
    canvasContainer,
    (renderer) => {
      const sim = new Algorithm(renderer, {
        SOLVER_ITERATIONS: 1,
        BOUNDARY_MARGIN: 0.05,
      });
      sim.init(1, 2, boundsTest, [0, 0]);
      sim.updateBounds(boundsTest2);
      sim.step(0, true);
      // sim.step();
      // sim.step();

      setTimeout(
        visualiseBounds.bind(null, particleRenderer, sim.sdf!.bounds!, 0.25)
      );

      const tex = sim.sdf!.returnSDF();
      // const tex = sim.sdf!.movegpuc.renderTarget.texture;
      // const tex = sim.sdf!.gpuc.renderTarget.texture;
      const [width, height] = sim.sdf!.getSize();
      return [tex, width, height];
      // return [new THREE.Texture(), 0, 0];
    },
    `uniform sampler2D tex;

  void main() {
      float index = 0.0 + (gl_FragCoord.x - 0.5) + (gl_FragCoord.y - 0.5) * resolution.x;

      vec2 uv = gl_FragCoord.xy / resolution.xy;
      vec4 info = texture2D(tex, uv).xyzw;

      float max = 1.0;
      info.x = pow(1.0 + info.x, 5.0) - 1.0;
      if (info.x < 0.0) gl_FragColor = vec4(-info.x / max, 0.0, 0.0, 1.0);
      else gl_FragColor  = vec4(0.0, 0.0, info.x / max, 1.0);
  }`
  );
};
// setTimeout(algorithmSDF);
