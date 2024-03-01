#define LINELISTLEN 12
#define LOOPLEN 12

uniform float[LINELISTLEN] areaVerts;

// preSegs must have a NUL to indicate early termination
uniform float[LINELISTLEN] preSegs;
uniform float[LINELISTLEN] postSegs;

uniform sampler2D SDF;

uniform vec2 scale;
uniform vec2 translate;
uniform vec2 oldScale;
uniform vec2 oldTranslate;

// preBulge and postBulge both need NUL appended to the end
uniform float NUL;

bool getSide(vec2 A, vec2 B, vec2 p) {
    return determinant(mat2(p - A, B - A)) > 0.0;
}

vec2 closestPointOnSeg(vec4 seg, vec2 p) {
    vec2 a = vec2(seg.x, seg.y);
    vec2 b = vec2(seg.z, seg.w);
    if ((dot(a - p, a - b) <= 0.0) != (dot(b - p, a - b) <= 0.0))
        return a + (b - a) * dot(b - a, p - a) / pow(distance(a, b), 2.0);
    else {
        if (distance(a, p) < distance(b, p)) return a;
        else return b;
    }
}

void main() {
    vec2 coord = gl_FragCoord.xy;
    vec2 pos = (coord / scale) - translate;

    // Check if pos is within the movement zone
    vec4 sdf = texture2D(SDF, (pos + oldTranslate) * oldScale / resolution.xy).xyzw;
    if (sdf.x > 0.0 || preSegs[0] == NUL) {
        gl_FragColor = sdf;
        return;
    }

    bool isInside = true; bool side;
    for (int i = 0; i < LOOPLEN / 2; i++) {
        vec2 v1 = vec2(areaVerts[i * 2], areaVerts[i * 2 + 1]);
        if (v1.x == NUL) break;
        vec2 v2 = vec2(areaVerts[i * 2 + 2], areaVerts[i * 2 + 3]);
        if (v2.x == NUL) v2 = vec2(areaVerts[0], areaVerts[1]);

        if (i == 0) side = getSide(v1, v2, pos);
        else {
            isInside = (side == getSide(v1, v2, pos));
            if (!isInside) break;
        }
    }
    if (!isInside) {
        gl_FragColor = sdf;
        return;
    }

    int bestSegID; vec2 bestPoint;
    for (int i = 0; i < 3; i++) {
        if (preSegs[i * 4] == NUL) break;
        vec4 seg = vec4(preSegs[i * 4], preSegs[i * 4 + 1], preSegs[i * 4 + 2], preSegs[i * 4 + 3]);
        vec2 point = closestPointOnSeg(seg, pos);
        if (i == 0 || distance(pos, point) < distance(pos, bestPoint)) {
            bestSegID = i;
            bestPoint = point;
        }
    }

    // float mag = distance(bestPoint, pos);
    // gl_FragColor = vec4(mag, (bestPoint - pos) / mag, 1.0);
    // return;

    vec2 preSegA = vec2(preSegs[bestSegID * 4], preSegs[bestSegID * 4 + 1]);
    vec2 preSegB = vec2(preSegs[bestSegID * 4 + 2], preSegs[bestSegID * 4 + 3]);
    vec2 postSegA = vec2(postSegs[bestSegID * 4], postSegs[bestSegID * 4 + 1]);
    vec2 postSegB = vec2(postSegs[bestSegID * 4 + 2], postSegs[bestSegID * 4 + 3]);

    float percent = distance(preSegA, bestPoint) / distance(preSegA, preSegB);
    vec2 frontierPoint = postSegA + (postSegB - postSegA) * percent;

    float mag = distance(frontierPoint, pos);
    gl_FragColor = vec4(mag, (frontierPoint - pos) / mag, 1.0);
}
