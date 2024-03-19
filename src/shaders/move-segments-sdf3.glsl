#define LINELISTLEN 12
#define LOOPLEN 12

uniform float[LINELISTLEN] areaVerts;

uniform float[6] backVerts;
uniform float[6] frontVerts;
// segIndices must have a NUL to indicate early termination
uniform int[6] segIndices;

uniform sampler2D SDF;

uniform vec2 scale;
uniform vec2 translate;
uniform vec2 oldScale;
uniform vec2 oldTranslate;

// preBulge and postBulge both need NUL appended to the end
uniform float NUL;
uniform float boundaryMargin;
uniform float extraMargin;

float getSide(vec2 A, vec2 B, vec2 p) {
    vec2 norm = vec2(B.y - A.y, A.x - B.x);
    return dot(A - p, norm / length(norm));
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
    vec2 sdfCoord = (pos + oldTranslate) * oldScale / resolution.xy;
    vec4 sdf;
    if (sdfCoord.x < 1.0 && sdfCoord.x > 0.0 && sdfCoord.y < 1.0 && sdfCoord.y > 0.0)
        sdf = texture2D(SDF, sdfCoord).xyzw;
    else sdf = vec4(-11111.0, 0.0, 0.0, 0.0);

    // if (sdf.x > 0.0 || segIndices[0] == -1) {
    if (segIndices[0] == -1) {
        gl_FragColor = sdf;
        return;
    }

    bool isInside = true; bool side;
    bool isOutside = false;

    // getSide(v1, v2, v3)
    side = getSide(vec2(areaVerts[0], areaVerts[1]), vec2(areaVerts[2], areaVerts[3]), vec2(areaVerts[4], areaVerts[5])) > 0.0;

    for (int i = 0; i < LOOPLEN / 2; i++) {
        vec2 v1 = vec2(areaVerts[i * 2], areaVerts[i * 2 + 1]);
        if (v1.x == NUL) break;
        vec2 v2 = vec2(areaVerts[i * 2 + 2], areaVerts[i * 2 + 3]);
        if (v2.x == NUL) v2 = vec2(areaVerts[0], areaVerts[1]);

        float sideProx = getSide(v1, v2, pos);
        isInside = (side == (sideProx > 0.0));
        if (!isInside && (abs(sideProx) < boundaryMargin + extraMargin)) {
            isOutside = true;
            isInside = true;
        } else if (!isInside) break;
    }
    if (!isInside || (sdf.w == 1.0 && isOutside)) {
        gl_FragColor = sdf;
        return;
    }

    int bestV1i; int bestV2i; vec2 bestPoint;
    for (int i = 0; i < 3; i++) {
        if (segIndices[i * 2] == -1) break;
        int v1i = segIndices[i * 2]; int v2i = segIndices[i * 2 + 1];
        vec4 seg = vec4(backVerts[v1i * 2], backVerts[v1i * 2 + 1], backVerts[v2i * 2], backVerts[v2i * 2 + 1]);
        vec2 point = closestPointOnSeg(seg, pos);
        if (i == 0 || distance(pos, point) < distance(pos, bestPoint)) {
            bestV1i = v1i;
            bestV2i = v2i;
            bestPoint = point;
        }
    }

    vec2 preSegA = vec2(backVerts[bestV1i * 2], backVerts[bestV1i * 2 + 1]);
    vec2 preSegB = vec2(backVerts[bestV2i * 2], backVerts[bestV2i * 2 + 1]);
    vec2 postSegA = vec2(frontVerts[bestV1i * 2], frontVerts[bestV1i * 2 + 1]);
    vec2 postSegB = vec2(frontVerts[bestV2i * 2], frontVerts[bestV2i * 2 + 1]);

    float percent = distance(preSegA, bestPoint) / distance(preSegA, preSegB);
    vec2 frontierPoint = postSegA + (postSegB - postSegA) * percent;

    int otherVertID;
    if (bestV1i == 0) {
        if (bestV2i == 1) otherVertID = 2;
        else otherVertID = 1;
    } else if (bestV1i == 1) {
        if (bestV2i == 0) otherVertID = 2;
        else otherVertID = 0;
    } else { // bestV1i == 2
        if (bestV2i == 0) otherVertID = 1;
        else otherVertID = 0;
    }
    vec2 otherVert = vec2(frontVerts[otherVertID * 2], frontVerts[otherVertID * 2 + 1]);

    vec2 norm = normalize(vec2(postSegB.y - postSegA.y, postSegA.x - postSegB.x));
    if (dot(norm, otherVert - postSegA) > 0.0) norm *= -1.0;

    vec2 marginFrontierPoint = frontierPoint + norm * (boundaryMargin + extraMargin);

    float mag = distance(marginFrontierPoint, pos);
    vec2 dir = normalize(marginFrontierPoint - pos);

    bool inFrontierLane = (dot(postSegA - pos, postSegA - postSegB) < 0.0) != (dot(postSegB - pos, postSegA - postSegB) < 0.0);
    if (isOutside && !(mag < (boundaryMargin + extraMargin) && inFrontierLane)) {
        dir *= -1.0;
        mag *= -1.0;
    }

    gl_FragColor = vec4(mag, dir, 1.0);
}
