import {
  Vec2,
  Segment,
  Triangle,
  SolidObjs,
  generateRandomInds,
  permute,
} from "./helper";

const lEq = (l1: unknown[], l2: unknown[]) => l1.every((el, i) => el === l2[i]);
const dot = (v1: Vec2, v2: Vec2) => v1[0] * v2[0] + v1[1] * v2[1];
const scale = (v: Vec2, c: number): Vec2 => [v[0] * c, v[1] * c];
const add = (v1: Vec2, v2: Vec2): Vec2 => [v1[0] + v2[0], v1[1] + v2[1]];
const sub = (v1: Vec2, v2: Vec2): Vec2 => [v1[0] - v2[0], v1[1] - v2[1]];

export function segmentsEqual(s1: Segment, s2: Segment) {
  if (s1[0] === s2[0] && s1[1] === s2[1]) {
    if (s1[2] === s2[2] && s1[3] === s2[3]) return true;
    else return false;
  } else if (s1[2] === s2[0] && s1[3] === s2[1]) {
    if (s1[0] === s2[2] && s1[1] === s2[3]) return true;
    else return false;
  } else return false;
}

export function segmentInList(
  s: Segment,
  list: Segment[],
  index?: false
): boolean;
export function segmentInList(
  s: Segment,
  list: Segment[],
  index?: true
): number;
export function segmentInList(
  s: Segment,
  list: Segment[],
  index: boolean = false
) {
  if (!index) return list.some((el) => segmentsEqual(s, el));
  else {
    if (list.length !== 0)
      return Math.max.apply(
        null,
        list.map((el, i) => (segmentsEqual(s, el) ? i : -1))
      );
    else return -1;
  }
}

const pointOnSegmentLine = (seg: Segment, p: Vec2) => {
  // `seg` is a line segment from point A to point B. If we are able to describe P
  // as P = A + w1 * (B - A), then it must lie on the line AB. Solving for w1 in both
  // the x coordinate and y coordinate, substituting and simplifying gives the following.
  return (
    (p[0] - seg[0]) * (seg[3] - seg[1]) === (p[1] - seg[1]) * (seg[2] - seg[0])
  );
};

export const findNormal = (vi: Vec2, vj: Vec2, vOther: Vec2): boolean => {
  const vij: Vec2 = [vi[0] - vj[0], vi[1] - vj[1]];
  // Comes from asking "which is closer to the absolute point of vOther-
  //  (vij(AC) - vi) or (vij(C) - vi)" (a normal extended from a point on the line).
  // length(vij(AC) - vi - vOther) < length(vij(C) - vi - vOther)
  const isAC = vij[0] * (vi[1] - vOther[1]) < vij[1] * (vi[0] - vOther[0]);
  return isAC;
};

const createNormal = (
  s: Segment,
  isAC: boolean,
  normalizeLength: boolean = false
): Vec2 => {
  const len = normalizeLength
    ? Math.sqrt((s[0] - s[2]) ** 2 + (s[1] - s[3]) ** 2)
    : 1;
  if (isAC) return [(s[3] - s[1]) / len, (s[0] - s[2]) / len];
  else return [(s[1] - s[3]) / len, (s[2] - s[0]) / len];
};

function triangleContainsPoint(triangle: Triangle, p: Vec2) {
  // debugger;
  // Say A, B and C are the vertices that make up our triangle, and we want
  //  to check if point P lies in ABC. What we can do is the following bit of vector math,
  // P = A + w1 * (B - A) + w2 * (C - A)
  // We can find a w1 and w2 for any point in 2D space, so we find the values corresponding to P,
  //  and visualising what w1 and w2 mean (as vectors point from and to the triangle vertices),
  //  it's trivial to see that if w1 < 0 OR w2 < 0 OR (w1 + w2) > 1, then the point must be outside.
  const Px = p[0];
  const Py = p[1];
  const Ax = triangle[0];
  const Ay = triangle[1];
  const Bx = triangle[2];
  const By = triangle[3];
  const Cx = triangle[4];
  const Cy = triangle[5];

  const w1 =
    (Ax * (Cy - Ay) + (Py - Ay) * (Cx - Ax) - Px * (Cy - Ay)) /
    ((By - Ay) * (Cx - Ax) - (Bx - Ax) * (Cy - Ay));
  const w2 =
    (Ax * (By - Ay) + (Py - Ay) * (Bx - Ax) - Px * (By - Ay)) /
    ((Cy - Ay) * (Bx - Ax) - (Cx - Ax) * (By - Ay));
  return w1 >= 0 && w2 >= 0 && w1 + w2 <= 1;
}

export function triangleContainsSegment(
  triangle: Triangle,
  seg: Segment
): boolean {
  // debugger;
  // If the triangle contains both ends of the segment, then it must contain the
  //  entire segment (considering how triangles are convex).
  let isContained = true;
  for (const [Px, Py] of [
    [seg[0], seg[1]],
    [seg[2], seg[3]],
  ]) {
    isContained = isContained && triangleContainsPoint(triangle, [Px, Py]);
  }
  return isContained;
}

export function adjustLineSegmentsIntersection(
  Ip: Vec2,
  seg1: Segment,
  seg1Normal: boolean,
  seg2: Segment,
  seg2Normal: boolean
): [seg1: Segment, seg2: Segment] {
  // debugger;

  // Move one of the ends of both intersecting segments respectively to their intersection.
  // We choose which end to move by seeing which the other segment's normal points towards.

  const seg1NormVec = createNormal(seg1, seg1Normal);
  const seg2NormVec = createNormal(seg2, seg2Normal);

  // if (vector from a point on the other line to the point we're testing)・(normal of other line) > 0
  //  then the normal points towards that point, and thus it must pass through the interior of a solid.
  let seg1New: Segment;
  // if (vi - Ip)・Normal > 0, then the normal points in vi's direction
  // however, to fix ambiguity/numerical errors when vi or vj == Ip, we instead check for
  // if the normal points "more" at vi than it does vj.
  if (
    dot([seg1[0] - Ip[0], seg1[1] - Ip[1]], seg2NormVec) >
    dot([seg1[2] - Ip[0], seg1[3] - Ip[1]], seg2NormVec)
  )
    seg1New = [Ip[0], Ip[1], seg1[2], seg1[3]];
  else seg1New = [seg1[0], seg1[1], Ip[0], Ip[1]];

  let seg2New: Segment;
  if (
    dot([seg2[0] - Ip[0], seg2[1] - Ip[1]], seg1NormVec) >
    dot([seg2[2] - Ip[0], seg2[3] - Ip[1]], seg1NormVec)
  )
    // It's important that the order of vi/vj from the `trianglesToLineSegments`
    //  call stays consistent here, so that we can use the same normals found from
    //  the one `findNormal` call/s.
    seg2New = [Ip[0], Ip[1], seg2[2], seg2[3]];
  else seg2New = [seg2[0], seg2[1], Ip[0], Ip[1]];

  return [seg1New, seg2New];
}

interface SegClosestPoint {
  distance: number;
  point: Vec2;
  isEnd: false | "p1" | "p2";
}

export const segDistance = (seg: Segment, c: Vec2): SegClosestPoint => {
  // debugger;
  const p1: Vec2 = [seg[0], seg[1]];
  const p2: Vec2 = [seg[2], seg[3]];
  const p12: Vec2 = [seg[0] - seg[2], seg[1] - seg[3]];

  // It's <= instead of <, because when c is one the edge of the "lane", we'd like it
  //  to be considered outside the lane instead of inside.
  const p1CSide = dot(sub(p1, c), p12) <= 0;
  const p2CSide = dot(sub(p2, c), p12) <= 0;
  // If the vectors pointing from p1 to c, and from p2 to c point in opposite direction,
  //  then c must lie between p1 and p2, on their segment's "lane".
  if (p1CSide !== p2CSide) {
    // Thus, the segment's closest point to c must lie on the perpendicular line at c, between p1 and p2.
    const cp2: Vec2 = [c[0] - seg[2], c[1] - seg[3]];
    const p12Len = Math.sqrt(p12[0] ** 2 + p12[1] ** 2);
    const p = dot(p12, cp2) / p12Len; // the distance from p2 to the closest point
    let distance = Math.sqrt(cp2[0] ** 2 + cp2[1] ** 2 - p ** 2); // pythagoras
    if (isNaN(distance)) distance = 0;
    // closest point = c + distance * p12Norm (pointing in the oppsite direction of c)
    const point = add(
      scale(createNormal(seg, !findNormal(p1, p2, c), true), distance),
      c
    );
    return { distance, point, isEnd: false };
  } else {
    const p1Distance = (p1[0] - c[0]) ** 2 + (p1[1] - c[1]) ** 2;
    const p2Distance = (p2[0] - c[0]) ** 2 + (p2[1] - c[1]) ** 2;
    return {
      distance: Math.sqrt(Math.min(p1Distance, p2Distance)),
      point: p1Distance < p2Distance ? p1 : p2,
      isEnd: p1Distance < p2Distance ? "p1" : "p2",
    };
  }
};

export function isInsideSolid(
  p: Vec2,
  segments: Segment[],
  segmentNormals: boolean[]
) {
  // debugger;
  if (segments.length === 0) return false;
  // Find the closest point on a segment to p, and check if the normal points towards
  //  or away from p, saying if p is inside or outside a solid.
  // This works because we can assume that no part of any segment lies inside a solid
  //  (i.e. it's always a boundary point).
  let knownIsInside: boolean | undefined;
  let closestNormal: Vec2 = [NaN, NaN];
  let closestPoint: Vec2 = [NaN, NaN];
  let oldOtherPoint: Vec2 = [NaN, NaN];
  let closestLen: number | undefined;
  let segment: Segment;
  for (let j = 0; j < segments.length; j++) {
    const seg = segments[j];
    const { distance, point, isEnd } = segDistance(seg, p);
    if (typeof closestLen === "undefined" || distance <= closestLen) {
      const normal = createNormal(seg, segmentNormals[j]);
      // If the closest point is one of the ends of a segment, since there are always
      //  at least two segments that share an end, it's unclear whos normal to use.
      // Instead, we need to check if the two normals point towards or away from _each other_,
      //  because if they point towards each other and p is indeed inside the solid, then it will
      //  always find the closest segment point to lie on one of the segments, and not on one of
      //  the ends, which is a contradiction.
      if (isEnd) {
        // If multiple solids are sharing the same point, then it is the case that if we find ANY segment
        //  pairing whos normals point away from each other, then the queried point is inside a solid
        //  (and vice-versa as explained above, creating the iff statement). It is also the case that if such a
        //  segment pair doesn't exist in the setup, then any segment pair permutation possible will only ever
        //  have normals that point towards each other, or in the same direction.
        const otherPoint: Vec2 =
          isEnd === "p1" ? [seg[2], seg[3]] : [seg[0], seg[1]];
        if (lEq(point, closestPoint)) {
          const p1 = otherPoint;
          const n1 = normal;
          const p2 = oldOtherPoint;
          const n2 = closestNormal;

          const n1Away = dot(sub(p2, p1), n1) < 0; // n1 points away from p2
          const n2Away = dot(sub(p1, p2), n2) < 0; // n2 points away from p1
          if (n1Away && n2Away) {
            knownIsInside = true;
            break;
          } else {
            knownIsInside = false;
            continue;
          }
        }
        oldOtherPoint = otherPoint;
      } else knownIsInside = undefined;

      closestNormal = normal;
      closestPoint = point;
      closestLen = distance;
      segment = seg;
    }
  }

  if (typeof knownIsInside !== "undefined") {
    return closestLen === 0 ? false : knownIsInside;
    // if it == 0, then either p is ON the segment, or else just generally on its span
    //  (but then the closest point would be the end, which is handled before this).
  } else if (dot(sub(closestPoint, p), closestNormal) <= 0) return true;
  // Due to potential numerical errors of segDistance, we can't truly rely on the == 0 check above
  else if (pointOnSegmentLine(segment!, p)) return true;
  else return false;
}

function mayIntersect(s1: Segment, s2: Segment) {
  // If the line segments may ever overlap, then first their
  //  bounding boxes have to overlap
  const s1top = Math.max(s1[1], s1[3]);
  const s1right = Math.max(s1[0], s1[2]);
  const s1bottom = Math.min(s1[1], s1[3]);
  const s1left = Math.min(s1[0], s1[2]);

  const s2top = Math.max(s2[1], s2[3]);
  const s2right = Math.max(s2[0], s2[2]);
  const s2bottom = Math.min(s2[1], s2[3]);
  const s2left = Math.min(s2[0], s2[2]);

  return (
    s1left <= s2right &&
    s2left <= s1right &&
    s1bottom <= s2top &&
    s2bottom <= s1top
  );
}

export function isIntersecting(s1: Segment, s2: Segment) {
  // debugger;
  if (!mayIntersect(s1, s2)) return false;

  const p1X = s1[0];
  const p1Y = s1[1];
  const p2X = s1[2];
  const p2Y = s1[3];

  const s2p1X = s2[0];
  const s2p1Y = s2[1];
  const s2p2X = s2[2];
  const s2p2Y = s2[3];

  if (
    (p1X === s2p1X && p1Y === s2p1Y) ||
    (p1X === s2p2X && p1Y === s2p2Y) ||
    (p2X === s2p1X && p2Y === s2p1Y) ||
    (p2X === s2p2X && p2Y === s2p2Y)
  )
    return false;

  // This is a robust method for quickly checking if two line segments are intersection.
  // Important visuals for understanding are here: https://www.desmos.com/geometry/plp5zvmqjl

  // The checks for this are asymmetrical, where first we check if the vertices of one segment
  //  lie on opposite sides of the line spanned by the other.
  // Then, we check if the line spanned by these vertices intersect either bottom and top, or
  //  left and right of the bounding box on the other line segment, in which case they intersect.
  // The exception to this second check is when the slope of one line is a negative multiple of the
  //  other, in which case we just need to check if the line passes through the bounding box at all.

  const s2p1Side = (s2p1X - p1X) * (p2Y - p1Y) + (s2p1Y - p1Y) * (p1X - p2X);
  const s2p2Side = (s2p2X - p1X) * (p2Y - p1Y) + (s2p2Y - p1Y) * (p1X - p2X);
  // If either s2p1 or s2p2 (but not both) lie ON the line segment (which happens when s2pNSide === 0),
  //  then we'd like to say it intersects, note it's on the line SEGMENT, and so we also need to check
  //  that it lies between p1 and p2.
  const p12: Vec2 = [p1X - p2X, p1Y - p2Y];
  const s2p1InSpan =
    dot([p1X - s2p1X, p1Y - s2p1Y], p12) < 0 !==
    dot([p2X - s2p1X, p2Y - s2p1Y], p12) < 0;
  const s2p2InSpan =
    dot([p1X - s2p2X, p1Y - s2p2Y], p12) < 0 !==
    dot([p2X - s2p2X, p2Y - s2p2Y], p12) < 0;
  if (
    (s2p1Side === 0 && s2p1InSpan && s2p2Side !== 0) ||
    (s2p2Side === 0 && s2p2InSpan && s2p1Side !== 0)
  )
    return true;

  if (s2p1Side > 0 !== s2p2Side > 0) {
    const s1top = Math.max(p1Y, p2Y);
    const s1right = Math.max(p1X, p2X);
    const s1bottom = Math.min(p1Y, p2Y);
    const s1left = Math.min(p1X, p2X);

    // We're trying to (robustly) find the intersection points of the line with
    //  the (horizontal) lines spanned by the top and bottom of the bounding box.
    let m: number, bottomX: number, topX: number;
    if (Math.abs(s2p1Y - s2p2Y) < Math.abs(s2p1X - s2p2X)) {
      // y = mx + b
      m = (s2p1Y - s2p2Y) / (s2p1X - s2p2X);
      const b = s2p1Y - m * s2p1X;

      bottomX = (s1bottom - b) / m;
      topX = (s1top - b) / m;
    } else {
      // x = my + b
      m = (s2p1X - s2p2X) / (s2p1Y - s2p2Y);
      const b = s2p1X - m * s2p1Y;

      bottomX = s1bottom * m + b;
      topX = s1top * m + b;
    }

    // This determines, based on the positvity/negativity of both slopes,
    //  whether it's important that topX is left of the bounding box right side,
    //  or right of the left side
    const opposing = m > 0 !== (p2Y - p1Y > 0 === p2X - p1X > 0);
    const topRight = opposing ? m < 0 : m > 0;

    const isBottom = topRight ? bottomX > s1left : bottomX < s1right;
    const isTop = topRight ? topX < s1right : topX > s1left;
    if (isBottom === isTop) return true;
    // This is the same thing of if s2p1 or s2p2 lie ON the segment from above, but with p1/p2
    //  instead (this function should behave the same no matter the order of s1 and s2).
    else if (
      topRight
        ? (bottomX === s1left) !== (topX === s1right)
        : (bottomX === s1right) !== (topX === s1left)
    )
      return true;
    else return false;
  } else return false;
}

interface Line {
  m: number;
  b: number;
  isOfX: boolean;
}

const createLine = (s: Segment): Line => {
  if (Math.abs(s[1] - s[3]) < Math.abs(s[0] - s[2])) {
    const m = (s[1] - s[3]) / (s[0] - s[2]);
    return {
      m,
      b: s[1] - m * s[0],
      isOfX: true,
    };
  } else {
    const m = (s[0] - s[2]) / (s[1] - s[3]);
    return {
      m,
      b: s[0] - m * s[1],
      isOfX: false,
    };
  }
};

function getIntersection(s1: Segment, s2: Segment): Vec2 {
  const l1 = createLine(s1);
  const l2 = createLine(s2);

  let xPrime: number, yPrime: number;
  if (l1.isOfX && l2.isOfX) {
    xPrime = (l2.b - l1.b) / (l1.m - l2.m);
    yPrime = (l1.m * l2.b - l2.m * l1.b) / (l1.m - l2.m);
  } else if (l1.isOfX && !l2.isOfX) {
    xPrime = (l2.b + l2.m * l1.b) / (1 - l1.m * l2.m);
    yPrime = (l1.b + l1.m * l2.b) / (1 - l1.m * l2.m);
  } else if (!l1.isOfX && l2.isOfX) {
    xPrime = (l1.b + l1.m * l2.b) / (1 - l1.m * l2.m);
    yPrime = (l2.b + l2.m * l1.b) / (1 - l1.m * l2.m);
  } else {
    xPrime = (l1.m * l2.b - l2.m * l1.b) / (l1.m - l2.m);
    yPrime = (l2.b - l1.b) / (l1.m - l2.m);
  }
  return [xPrime, yPrime];
}

// IMP:
// `triangleContainsPoint` may either include points on the edge of the triangle or not (currently it does)
// `segDistance` may either classify points at the edge of the segment's "lane" as isEnd or not (currently it's not)
// `isInsideSolid` may either classify points ON a line segment as inside the solid or not (currently it does)
// `isIntersecting` may either classify segments that end at the edge of the other segment as intersecting or not (currently it does)
//                  may either classify segments that share an end as intersecting or not (currently it's not)
//                  may either classify segments with the same line as intersecting or not (currently it's not)

// The length of the output is `bounds.length` and at each index is a list of the
//  line segments that are associated with the original triangle at that index.
export type LineSegmentsReference = Segment[][];

export function trianglesToLineSegments(bounds: SolidObjs): Segment[];
// prettier-ignore
export function trianglesToLineSegments(bounds: SolidObjs, returnOpts: {normals?: false, triangleRef?: false}): Segment[]
// prettier-ignore
export function trianglesToLineSegments(bounds: SolidObjs, returnOpts: {normals?: false, triangleRef?: false, prefillLineSegs: LineSegmentsReference, prefillLineSegsNorms: boolean[][]}): Segment[]
// prettier-ignore
export function trianglesToLineSegments(bounds: SolidObjs, returnOpts: {normals?: false, triangleRef: true}): LineSegmentsReference
// prettier-ignore
export function trianglesToLineSegments(bounds: SolidObjs, returnOpts: {normals?: false, triangleRef: true, prefillLineSegs: LineSegmentsReference, prefillLineSegsNorms: boolean[][]}): LineSegmentsReference
// prettier-ignore
export function trianglesToLineSegments(bounds: SolidObjs, returnOpts: {normals: true, triangleRef?: false}): [segments: Segment[], normals: boolean[]]
// prettier-ignore
export function trianglesToLineSegments(bounds: SolidObjs, returnOpts: {normals: true, triangleRef?: false, prefillLineSegs: LineSegmentsReference, prefillLineSegsNorms: boolean[][]}): [segments: Segment[], normals: boolean[]]
// prettier-ignore
export function trianglesToLineSegments(bounds: SolidObjs, returnOpts: {normals: true, triangleRef: true}): [segments: LineSegmentsReference, normals: boolean[][]]
// prettier-ignore
export function trianglesToLineSegments(bounds: SolidObjs, returnOpts: {normals: true, triangleRef: true, prefillLineSegs: LineSegmentsReference, prefillLineSegsNorms: boolean[][]}): [segments: LineSegmentsReference, normals: boolean[][]]

/**
 * Turns a list of triangles into a list of line segments, which is processed so that
 * every point on every line segment is a boundary between the outside and inside of a
 * solid (i.e. no line segments exist inside solids).
 *
 * NOTE: The output may have multiple line segments from what can be described in one
 * (including duplicate line segments), and line segments that start and end at the
 * same point (i.e. are nothing at all).
 */
export function trianglesToLineSegments(
  bounds: SolidObjs,
  opts?: {
    normals?: boolean;
    triangleRef?: boolean;
    prefillLineSegs?: LineSegmentsReference;
    prefillLineSegsNorms?: boolean[][];
  }
) {
  opts ??= { normals: false, triangleRef: false };
  opts.normals ??= false;
  opts.triangleRef ??= false;
  opts.prefillLineSegs ??= [];
  opts.prefillLineSegsNorms ??= [];
  // prettier-ignore
  if (opts.prefillLineSegs.length !== opts.prefillLineSegsNorms.length)
    throw new ReferenceError(`prefillLineSegs not same length as prefillLineSegsNorms `+
                             `(${opts.prefillLineSegs.length} !== ${opts.prefillLineSegsNorms.length})`);
  const preNumGroups = opts.prefillLineSegsNorms.length;
  // debugger;

  // All we need is a boolean indicating if we're going anti-clockwise or clockwise
  //  from outSegments[j] to construct the normal (plus the assumption it's always from vi - vj).
  let outSegmentNormals: boolean[] = opts.prefillLineSegsNorms.flat();
  let outSegments: Segment[] = opts.prefillLineSegs.flat();

  const accInds = opts.prefillLineSegsNorms.map((arr) => arr.length);
  let triInds: number[] = accInds.map((len, i) => Array(len).fill(i)).flat();

  for (let i = 0; i < bounds.length; i++) {
    const v1: Vec2 = [bounds[i][0], bounds[i][1]];
    const v2: Vec2 = [bounds[i][2], bounds[i][3]];
    const v3: Vec2 = [bounds[i][4], bounds[i][5]];

    // Check if the overall triangle is a duplicate
    if (
      segmentInList([...v1, ...v2], outSegments) &&
      segmentInList([...v2, ...v3], outSegments) &&
      segmentInList([...v3, ...v1], outSegments)
    )
      continue;

    // No need for deepcopy, since we never modify the triangles themselves here (only add/remove from the list)
    const outSegments_: Segment[] = [...outSegments];
    const outSegmentNormals_: boolean[] = [...outSegmentNormals];
    const triInds_: number[] = [...triInds];

    // Remove these indices from outSegments after all have been collected
    const removeList: number[] = [];
    // Exclude adding these full sides of the triangle, as they've already been
    //  "partially added" since they're intersecting other things
    const excludeFullTriSeg: number[] = [];
    // Apparently JavaScript will recompute this value every iteration if it is not
    //  factored out, causing infinite loops...
    const outSegmentsLen = outSegments.length;
    for (let j = 0; j < outSegmentsLen; j++) {
      // Check the already added line segments for ones that are fully
      //  contained in the triangle
      if (triangleContainsSegment(bounds[i], outSegments[j])) {
        removeList.push(j);
        continue;
      }

      // Check for intersections in the line segments of the triangle
      for (const [k, [vi, vj, vOther]] of [
        [v1, v2, v3],
        [v2, v3, v1],
        [v3, v1, v2],
      ].entries()) {
        const triSeg: Segment = [...vi, ...vj];
        const seg: Segment = outSegments[j];
        if (isIntersecting(triSeg, seg)) {
          removeList.push(j);
          excludeFullTriSeg.push(k);
          const Ip = getIntersection(triSeg, outSegments[j]);
          const triSegNormal = findNormal(vi, vj, vOther);
          const segNormal = outSegmentNormals[j];
          outSegments.push(
            ...adjustLineSegmentsIntersection(
              Ip,
              triSeg,
              triSegNormal,
              seg,
              segNormal
            )
          );
          outSegmentNormals.push(triSegNormal, segNormal);
          triInds.push(i + preNumGroups, triInds[j]);
        }
      }
    }
    // Remove segments on the remove list, since they're inside the new triangle,
    //  or have been re-added "partially", since they intersect the new triangle.
    outSegments = outSegments.filter((_, i) => !removeList.includes(i));
    outSegmentNormals = outSegmentNormals.filter(
      (_, i) => !removeList.includes(i)
    );
    triInds = triInds.filter((_, i) => !removeList.includes(i));

    let fullTriSegsContained: number = 0;
    for (const [k, [vi, vj, vOther]] of [
      [v1, v2, v3],
      [v2, v3, v1],
      [v3, v1, v2],
    ].entries()) {
      // Add in the full, untouched segments of the triangle, if they're outside the current solids.
      if (excludeFullTriSeg.includes(k)) continue;
      // We query the midpoint here, because if we pick one of the ends we may get false positives.
      const mid: Vec2 = [(vi[0] + vj[0]) / 2, (vi[1] + vj[1]) / 2];
      if (isInsideSolid(mid, outSegments_, outSegmentNormals_)) {
        fullTriSegsContained++;
        continue;
      }
      outSegments.push([...vi, ...vj]);
      outSegmentNormals.push(findNormal(vi, vj, vOther));
      triInds.push(i + preNumGroups);
    }
    // If the full triangle is contained, then ignore everything we've done this iteration,
    //  keep the same outSegments from before.
    if (fullTriSegsContained === 3) {
      outSegments = outSegments_;
      outSegmentNormals = outSegmentNormals_;
      triInds = triInds_;
    }
  }

  let out: LineSegmentsReference | Segment[];
  let outNormals: boolean[][] | boolean[];
  if (opts.triangleRef) {
    out = Array.from(Array(bounds.length + preNumGroups), () => []);
    outNormals = Array.from(Array(bounds.length + preNumGroups), () => []);
    for (let i = 0; i < outSegments.length; i++) {
      out[triInds[i]].push(outSegments[i]);
      outNormals[triInds[i]].push(outSegmentNormals[i]);
    }
    out = [...opts.prefillLineSegs, ...out];
    outNormals = [...opts.prefillLineSegsNorms, ...outNormals];
  } else {
    out = outSegments;
    outNormals = outSegmentNormals;
  }
  if (opts.normals) return [out, outNormals];
  else return out;
}

/**
 * Turns a list of triangles into a list of line segments, without any processing done,
 * so that the result is qualitatively the same as the input, and if triangles overlap or
 * generally conjoin to make bigger shapes, there will be line segments (or parts of line
 * segments) inside the solids.
 */
export function basicTrianglesToLineSegments(bounds: SolidObjs) {
  const outSegments: Segment[] = [];
  for (let i = 0; i < bounds.length; i++) {
    const v1: Vec2 = [bounds[i][0], bounds[i][1]];
    const v2: Vec2 = [bounds[i][2], bounds[i][3]];
    const v3: Vec2 = [bounds[i][4], bounds[i][5]];
    outSegments.push([...v1, ...v2], [...v2, ...v3], [...v3, ...v1]);
  }
  return outSegments;
}

export function cleanupLineSegments(
  segments: Segment[],
  normals: boolean[]
): [out: Segment[], outNorms: boolean[]] {
  let out: Segment[] = Array(segments.length);
  let outNorms: boolean[] = Array(normals.length);

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const norm = normals[i];
    if (seg[0] === seg[2] && seg[1] === seg[3]) continue;
    if (segmentInList(seg, out)) continue;
    out[i] = seg;
    outNorms[i] = norm;
  }
  out = out.filter((n) => n);
  // TODO: Remove this permute, unnecessary
  outNorms = outNorms.filter((n) => n || !n);
  const inds = generateRandomInds(out.length);
  out = permute(out, inds);
  outNorms = permute(outNorms, inds);

  console.log(out, outNorms);
  return [out, outNorms];
}
