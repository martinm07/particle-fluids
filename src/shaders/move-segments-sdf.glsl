#define LINELISTLEN 12
#define LOOPLEN 12
uniform float[LINELISTLEN] areaVerts;
// A list of vertices, ordered from point A, making progressive steps until point B
uniform float[LINELISTLEN] preBulge;
uniform float[LINELISTLEN] postBulge;

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
// Returns whether or not an antclockwise rotation of vij (vi - vj) would point
//  towards vOther
bool findNormal(vec2 vi, vec2 vj, vec2 vOther) {
    vec2 vij = vi - vj;
    return vij.x * (vi.y - vOther.y) < vij.y * (vi.x - vOther.x); // isAC?
}
vec2 createNormal(vec2 vi, vec2 vj, bool isAC) {
    float len = distance(vi, vj);
    if (isAC) return vec2(vj.y - vi.y, vi.x - vj.x) / len;
    else return vec2(vi.y - vj.y, vj.x - vi.x) / len;
}

float[LOOPLEN] getVertPercents(float[LINELISTLEN] verts) {
    float[LOOPLEN] percents;
    if (verts[0] == NUL) return percents;

    float totalDistance = 0.0;
    vec2 prevPos = vec2(verts[0], verts[1]);

    // Find cumulative distances
    for (int i = 1; i < LOOPLEN / 2; i++) {
        float x = verts[i * 2];
        if (x == NUL) break;
        float y = verts[i * 2 + 1];
        vec2 pos = vec2(x, y);
        
        totalDistance += distance(prevPos, pos);
        percents[i] = totalDistance;
        prevPos = pos;
    }
    // Normalize all entries
    for (int i = 1; i < LOOPLEN / 2; i++) {
        float x = verts[i * 2];
        if (x == NUL) break;
        
        percents[i] /= totalDistance;
    }
    return percents;
}

void main() {
    // (coord / scale) - translate;
    // (pos + oldTranslate) * oldScale;

    vec2 coord = gl_FragCoord.xy;
    vec2 pos = (coord / scale) - translate;

    bool isInside = true; bool side;
    for (int i = 0; i < LOOPLEN / 2; i++) {
        vec2 v1 = vec2(areaVerts[i * 2], areaVerts[i * 2 + 1]);
        if (v1.x == 0.0 && v1.y == 0.0) break;
        vec2 v2 = vec2(areaVerts[i * 2 + 2], areaVerts[i * 2 + 3]);
        if (v2.x == 0.0 && v2.y == 0.0) v2 = vec2(areaVerts[0], areaVerts[1]);

        if (i == 0) side = getSide(v1, v2, pos);
        else {
            isInside = (side == getSide(v1, v2, pos));
            if (!isInside) break;
        }
    }
    if (!isInside) {
        // gl_FragColor = texture2D(SDF, coord / resolution.xy).xyzw;
        gl_FragColor = texture2D(SDF, (pos + oldTranslate) * oldScale / resolution.xy).xyzw;
        // gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }

    // Assign each vertex in preBulge and postBulge respectively
    //  a percent of perimiter distance from point A to B
    float[LOOPLEN] preBulgePercents = getVertPercents(preBulge);
    float[LOOPLEN] postBulgePercents = getVertPercents(postBulge);

    // Find the closest point in preBulge.

    // vector such that `nearest + pos` is the closest point on the preBulge
    vec2 nearest;
    int nearestVi;
    vec2 prevVert = vec2(preBulge[0], preBulge[1]);
    for (int i = 1; i < LOOPLEN / 2; i++) {
        vec2 vert = vec2(preBulge[i * 2], preBulge[i * 2 + 1]);
        if (vert.x == NUL) break;

        vec2 vi = prevVert; vec2 vj = vert; vec2 vij = prevVert - vert;
        bool posInSpan = (dot(vi - pos, vij) <= 0.0) ^^ (dot(vj - pos, vij) <= 0.0);
        // Assuming concavity (and that pos is inside) saves a lot of logic for the segments' ends
        vec2 nearestSegPoint;
        if (posInSpan) {
            // gl_FragColor = vec4(10.0, 0.0, 0.0, 0.0);
            // return;

            vec2 norm = createNormal(vi, vj, !findNormal(vi, vj, pos));
            float distance_ = dot(norm, vi - pos);
            nearestSegPoint = norm * distance_;
        } else {
            // gl_FragColor = vec4(-10.0, 0.0, 0.0, 0.0);
            // return;

            float viDist = distance(vi, pos); float vjDist = distance(vj, pos);
            if (viDist < vjDist) nearestSegPoint = vi - pos;
            else nearestSegPoint = vj - pos;
        }

        if (i == 1 || length(nearestSegPoint) < length(nearest)) {
            nearest = nearestSegPoint;
            nearestVi = i - 1;
        };
        prevVert = vert;
    }

    // gl_FragColor = vec4(-123.0, 0.0, 0.0, 0.0);
    // return;

    // Get `nearest` as percent of perimeter distance

    float c_ = preBulgePercents[nearestVi];
    vec2 vi = vec2(preBulge[nearestVi * 2], preBulge[nearestVi * 2 + 1]);
    vec2 vj = vec2(preBulge[nearestVi * 2 + 2], preBulge[nearestVi * 2 + 3]);
    float segPercent = distance(vi, pos + nearest) / distance(vi, vj);
    float vjC = preBulgePercents[nearestVi + 1];
    float c = (1.0 - segPercent) * c_ + segPercent * vjC;

    // gl_FragColor = vec4(c, 0.0, 0.0, 0.0);
    // return;

    // Translate `c` into a point on the post-bulge

    vec2 vji; int i;
    float prevPercent = 0.0; // postBulgePercents[0] = 0.0
    float curPercent;
    for (i = 1; i < LOOPLEN / 2; i++) {
        if (postBulge[i * 2] == NUL) break;
        vji = vec2(postBulge[i * 2], postBulge[i * 2 + 1]) - vec2(postBulge[i * 2 - 2], postBulge[i * 2 - 1]);
        // vji = postBulge[i] - postBulge[i - 1];
        curPercent = postBulgePercents[i];
        if (curPercent >= c) break;
        prevPercent = curPercent;
    }
    
    float postSegPercent = (c - prevPercent) / (curPercent - prevPercent);
    vec2 postBulgePos = vec2(postBulge[(i - 1) * 2], postBulge[(i - 1) * 2 + 1]) + postSegPercent * vji; // vi + percent * (vj - vi)

    float finalDistance = distance(pos, postBulgePos);
    gl_FragColor = vec4(finalDistance, (postBulgePos - pos) / finalDistance, 0.0);
    // gl_FragColor = vec4(finalDistance, 0.0, 0.0, 0.0);
}
