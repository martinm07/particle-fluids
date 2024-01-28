#define LINELISTLEN 12
#define LOOPLEN 12
uniform float[LINELISTLEN] areaVerts;
// A list of vertices, ordered from point A, making progressive steps until point B
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

void main() {
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
        gl_FragColor = texture2D(SDF, (pos + oldTranslate) * oldScale / resolution.xy).xyzw;
        return;
    }

    // Find the closest point in preBulge.

    // vector such that `nearest + pos` is the closest point on the postBulge
    vec2 nearest;
    int nearestVi;
    vec2 prevVert = vec2(postBulge[0], postBulge[1]);
    for (int i = 1; i < LOOPLEN / 2; i++) {
        vec2 vert = vec2(postBulge[i * 2], postBulge[i * 2 + 1]);
        if (vert.x == NUL) break;

        vec2 vi = prevVert; vec2 vj = vert; vec2 vij = prevVert - vert;
        bool posInSpan = (dot(vi - pos, vij) <= 0.0) ^^ (dot(vj - pos, vij) <= 0.0);
        // Assuming concavity (and that pos is inside) saves a lot of logic for the segments' ends
        vec2 nearestSegPoint;
        if (posInSpan) {
            vec2 norm = createNormal(vi, vj, !findNormal(vi, vj, pos));
            float distance_ = dot(norm, vi - pos);
            nearestSegPoint = norm * distance_;
        } else {
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

    float mag = length(nearest);
    vec2 dir = nearest / mag;
    gl_FragColor = vec4(mag, dir, 1.0);
}
