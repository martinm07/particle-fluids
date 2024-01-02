import {
  adjustLineSegmentsIntersection,
  basicTrianglesToLineSegments,
  findNormal,
  isInsideSolid,
  segDistance,
  triangleContainsSegment,
  trianglesToLineSegments,
} from "./boundsHelper";
import { SolidObjs } from "./helper";
import { visualiseBounds } from "./script";

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

const segmentsTestNest = trianglesToLineSegments(boundsTest, {
  triangleRef: true,
});
console.log(segmentsTestNest);
const segmentsTest = basicTrianglesToLineSegments(boundsTest);
// const segmentsTest = segmentsTestNest.flat();

// setTimeout(visualiseBounds.bind(null, segmentsTest, 0.25));
