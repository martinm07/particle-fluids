#define LINELISTLEN 150 

uniform float[LINELISTLEN] bounds;
uniform bool[LINELISTLEN] segNormals;
uniform vec2 scale;
uniform vec2 translate;

void main() {
    vec2 coord = gl_FragCoord.xy;
    vec2 pos = (coord / scale) - translate;

    float nearest = -1.0; vec2 dir = vec2(0.0, 0.0);
    bool isInSpan = true;

    vec2 nearestPoint;
    bool oldIsAC; vec2 oldOtherPoint; bool oldPointVi;
    bool isEnd; bool insideAtEnd;
    
    for (int i = 0; i < LINELISTLEN / 4; i++) {
        vec2 vi = vec2(bounds[i * 4 + 0], bounds[i * 4 + 1]);
        vec2 vj = vec2(bounds[i * 4 + 2], bounds[i * 4 + 3]);
        if (vi.x == 0.0 && vi.y == 0.0 && vj.x == 0.0 && vj.y == 0.0) continue; // can probably be "break"
        bool isAC = segNormals[i];

        vec2 vij = vi - vj;
        bool posInSpan = (dot(vi - pos, vij) <= 0.0) ^^ (dot(vj - pos, vij) <= 0.0);
        // bool posInSpan = dot(vi - pos, vij) * dot(vj - pos, vij) < 0.0;

        float distance_; vec2 dir_;
        vec2 point; bool pointVi; // only utilized if !posInSpan
        if (posInSpan) {
            vec2 normal;
            if (isAC) normal = vec2(-vij.y, vij.x) / length(vij);
            else normal = vec2(vij.y, -vij.x) / length(vij);
            distance_ = dot(pos - vi, normal);
            dir_ = -normal;
        } else {
            float viDist = distance(vi, pos); float vjDist = distance(vj, pos);
            
            if (viDist < vjDist) {
                distance_ = viDist;
                dir_ = (pos - vi) / viDist;
                point = vi; pointVi = true;
            } else {
                distance_ = vjDist;
                dir_ = (pos - vj) / vjDist;
                point = vj; pointVi = false;
            }

            if (nearestPoint == point) {
                vec2 n1;
                if (isAC) n1 = vec2(-vij.y, vij.x);
                else n1 = vec2(vij.y, -vij.x);
                
                vec2 oldVij = nearestPoint - oldOtherPoint;
                if (!oldPointVi) oldVij = -oldVij;
                vec2 n2;
                if (oldIsAC) n2 = vec2(-oldVij.y, oldVij.x);
                else n2 = vec2(oldVij.y, -oldVij.x);

                vec2 otherPoint = vi;
                if (pointVi) otherPoint = vj;

                bool n1Away = dot(oldOtherPoint - otherPoint, n1) < 0.0;
                bool n2Away = dot(otherPoint - oldOtherPoint, n2) < 0.0;

                if (n1Away && n2Away) {
                    insideAtEnd = true;
                } else {
                    insideAtEnd = false;
                }
            }
        }

        if (nearest == -1.0 || abs(distance_) < abs(nearest)) {

            nearest = distance_;
            dir = dir_;
            isInSpan = posInSpan;
            oldIsAC = isAC;
            // if (abs(distance_) != abs(nearest)) insideAtEnd = false;
            // insideAtEnd = false;

            isEnd = !posInSpan;
            if (!posInSpan) {
                oldPointVi = pointVi;
                if (pointVi) {
                    nearestPoint = vi; oldOtherPoint = vj;
                } else {
                    nearestPoint = vj; oldOtherPoint = vi;
                }
            }
        }
    }
    if (isEnd && !insideAtEnd) nearest = -nearest;
    float distanceFromZero = sqrt(pow(pos.x - 1.0, 2.0) + pow(pos.y + 1.0, 2.0));
    isInSpan = true;
    if (!isInSpan) gl_FragColor = vec4(-10.0, 0.0, 0.0, 0.0);
    else gl_FragColor = vec4(nearest, dir, 0.0);
}
