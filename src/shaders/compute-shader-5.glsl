#define LINESLISTLEN 100 

flat varying float pRefN_startIndex;
flat varying float pRefN_Length;
flat varying float numExtras;
uniform vec2 nRefRes;
uniform vec2 c1Resolution;
uniform vec2 c3Resolution;
uniform vec2 c4Resolution;
uniform vec2 pRes;
uniform float N;
uniform float P;

uniform sampler2D xStarAndVelocity;
uniform sampler2D X;
uniform float restDensity;
uniform float boundaryMargin;

uniform float NUL;
uniform float[LINESLISTLEN] lineBounds;
uniform sampler2D SDF;
uniform vec2 SDFtranslate;
uniform vec2 SDFscale;

uniform sampler2D GPUC5_Mask;
uniform sampler2D GPUC3_Out;
uniform sampler2D GPUC4_Out;
uniform sampler2D pRefN;
uniform sampler2D pRefPN;

uniform bool debug;

float interpretBytesVector(vec4 bytes) {
    bytes *= 255.0;
    // reverse the order of the bytes becuase we want big-endian- 
    //  the JavaScript is to keep it at little-endian storage.
    uint b1 = uint(bytes.w);
    uint b2 = uint(bytes.z);
    uint b3 = uint(bytes.y);
    uint b4 = uint(bytes.x);
    uint combined = (((b1 << 24) | (b2 << 16)) | (b3 << 8)) | b4;
    return uintBitsToFloat(combined);
}
vec4 interpretFloat(float num) {
    uint numBits = floatBitsToUint(num);
    return vec4(float((255u & numBits) >> 0) / 255.0,
                float((65280u & numBits) >> 8) / 255.0,
                float((16711680u & numBits) >> 16) / 255.0,
                float((4278190080u & numBits) >> 24) / 255.0);
}

vec2 getCoord(float index, vec2 res) {
    float refX = mod(index, res.x) + 0.5;
    float refY = trunc(index / res.x) + 0.5;
    vec2 refCoord = vec2(refX, refY) / res;
    return refCoord;
}

struct LineInfo {
    bool isOfX;
    float m;
    float b;
    vec2 p1;
    vec2 p2;
};

// Finds the slope and y-intercept of a line (either as a function of x or y) that passes through both points
LineInfo lineFromPoints(vec2 p1, vec2 p2) {
    // If we are closer to the y-axis, then we'll switch to a line of `x = my + b`.
    //  This avoids the bound on infinity as we approach a vertical line.
    bool isOfX = abs(p1.y - p2.y) < abs(p1.x - p2.x);
    float m;
    float b;
    if (isOfX) {
        m = (p1.y - p2.y) / (p1.x - p2.x);
        b = p1.y - m * p1.x;
    } else {
        m = (p1.x - p2.x) / (p1.y - p2.y);
        b = p1.x - m * p1.y;
    }
    return LineInfo(isOfX, m, b, p1, p2);
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    float mask = texture2D(GPUC5_Mask, uv).x * 255.0;
    if (mask == 2.0) { // Update xStar
        float computeIndex = (gl_FragCoord.x - 0.5) + (gl_FragCoord.y - 0.5) * resolution.x - P;

        vec2 lambdaRef = getCoord(floor(computeIndex / 2.0), c4Resolution);
        float lambda_i = interpretBytesVector(texture2D(GPUC4_Out, lambdaRef).xyzw);

        vec2 deltaP = vec2(0.0, 0.0);
        for (float j = 0.0; j < pRefN_Length; j++) {
            vec2 refCoord = getCoord(pRefN_startIndex + j, nRefRes);
            vec2 coord = texture2D(pRefN, refCoord).xy;
            vec2 indexCoord = coord * c3Resolution - 0.5;
            float index = indexCoord.x + indexCoord.y * c3Resolution.x;

            float c4Index = texture2D(pRefPN, refCoord).x;
            vec2 lambdajCoord = getCoord(c4Index, c4Resolution);
            // This doesn't need adjustment for being an "extra," as that's already done.
            float lambda_j = interpretBytesVector(texture2D(GPUC4_Out, lambdajCoord).xyzw);

            vec2 dWx_coord = getCoord(index + (N / 4.0), c3Resolution);
            float dWx = interpretBytesVector(texture2D(GPUC3_Out, dWx_coord).xyzw);
            vec2 dWy_coord = getCoord(index + 2.0 * (N / 4.0), c3Resolution);
            float dWy = interpretBytesVector(texture2D(GPUC3_Out, dWy_coord).xyzw);
            vec2 dW = vec2(dWx, dWy);

            if (pRefN_Length - j <= numExtras) {
                dW *= -1.0;
            }

            deltaP += (lambda_i + lambda_j) * dW;
            // deltaP += dW;
        }
        vec2 sCorr_xRef = getCoord(floor(computeIndex / 2.0) + P / 2.0, c4Resolution);
        vec2 sCorr_yRef = getCoord(floor(computeIndex / 2.0) + P, c4Resolution);
        float sCorr_x = interpretBytesVector(texture2D(GPUC4_Out, sCorr_xRef).xyzw);
        float sCorr_y = interpretBytesVector(texture2D(GPUC4_Out, sCorr_yRef).xyzw);
        deltaP += vec2(sCorr_x, sCorr_y);
        deltaP *= 1.0 / restDensity;

        // IMP: In difference to the original algorithm, we adjust xStar by deltaP *before* collision response.
        ///     It may be worth it to look at both behaviours.
        vec2 xStar_xCoord = getCoord(2.0 * floor(computeIndex / 2.0) + P, c1Resolution);
        float xStar_x = interpretBytesVector(texture2D(xStarAndVelocity, xStar_xCoord).xyzw);

        vec2 xStar_yCoord = getCoord(2.0 * floor(computeIndex / 2.0) + 1.0 + P, c1Resolution);
        float xStar_y = interpretBytesVector(texture2D(xStarAndVelocity, xStar_yCoord).xyzw);

        vec2 newXStar = vec2(xStar_x, xStar_y) + deltaP;

        float IDpairX = 2.0 * floor(computeIndex / 2.0); float IDpairY = IDpairX + 1.0;
        float x_x = interpretBytesVector(texture2D(X, getCoord(IDpairX, pRes)).xyzw);
        float x_y = interpretBytesVector(texture2D(X, getCoord(IDpairY, pRes)).xyzw);
        vec2 x = vec2(x_x, x_y);

        //// Perform collision detection & response on `newXStar`

        LineInfo line1 = lineFromPoints(x, newXStar);
        float m1 = line1.m; float b1 = line1.b;

        int numIntersected = 0;
        vec2 holdingPoint = vec2(0.0, 0.0);
        float holdingDistance = 0.0;

        float xPrime; float yPrime;
        for (int k = 0; k < LINESLISTLEN; k += 4) {
            if (lineBounds[k] == NUL) {
                break;
            }
            float xp1 = lineBounds[k]; float yp1 = lineBounds[k + 1];
            float xp2 = lineBounds[k + 2]; float yp2 = lineBounds[k + 3];
            vec2 p1Core = vec2(xp1, yp1); vec2 p2Core = vec2(xp2, yp2);
            vec2 p12 = p1Core - p2Core;
            
            // is oriented for anti-clockwise rotation from core
            bool isAC = p12.y * (newXStar.x - x.x) > p12.x * (newXStar.y - x.y);

            vec2 normal;
            if (isAC) {
                normal = vec2(-p12.y, p12.x) / length(p12);
            } else {
                normal = vec2(p12.y, -p12.x) / length(p12);
            }
            vec2 p1 = p1Core + boundaryMargin * normal; vec2 p2 = p2Core + boundaryMargin * normal;
            vec2 p12Core = p12;
            p12 = p1 - p2;

            LineInfo line2 = lineFromPoints(p1, p2);
            float m2 = line2.m; float b2 = line2.b;
            
            if (line1.isOfX && line2.isOfX) {
                xPrime = (b2 - b1) / (m1 - m2);
                yPrime = (m1 * b2 - m2 * b1) / (m1 - m2);
            } else if (line1.isOfX && !line2.isOfX) {
                xPrime = (b2 + m2 * b1) / (1.0 - m1 * m2);
                yPrime = (b1 + m1 * b2) / (1.0 - m1 * m2);
            } else if (!line1.isOfX && line2.isOfX) {
                xPrime = (b1 + m1 * b2) / (1.0 - m1 * m2);
                yPrime = (b2 + m2 * b1) / (1.0 - m1 * m2);
            } else {
                xPrime = (m1 * b2 - m2 * b1) / (m1 - m2);
                yPrime = (b2 - b1) / (m1 - m2);
            }

            if (isnan(xPrime) || isnan(yPrime)) continue;

            vec2 prime = vec2(xPrime, yPrime);
            bool shiftedCloser = length(prime - x) < length(newXStar - x);
            // This line can probably be optimized (visualised: https://www.desmos.com/geometry/xkcz47r1mp)
            bool isInSpan = dot(p1 - prime, p12) * dot(p2 - prime, p12) <= 0.0;
            
            vec2 p_ac = vec2(-p12Core.y, p12Core.x);
            bool isBetween = dot(x - p1Core, p_ac) * dot(newXStar - p1Core, p_ac) <= 0.0;
            bool xStarCloser = abs(p12Core.x * (newXStar.y - p1Core.y) - p12Core.y * (newXStar.x - p1Core.x)) <
                               abs(p12Core.x * (x.y        - p1Core.y) - p12Core.y * (x.x        - p1Core.x));
            bool isPointedAt = isBetween || xStarCloser;

            if ((shiftedCloser && isInSpan && isPointedAt && newXStar != x)) {
                // intersection is true
                float distance = length(prime - x);
                if (numIntersected == 0 || distance < holdingDistance) {
                    holdingPoint = prime;
                    holdingDistance = distance;
                }
                numIntersected += 1;
            }
        }
        if (numIntersected > 0) {
            newXStar = holdingPoint;
        }

        //// Stable, reference behaviour of floor and two walls that extend out to infinity.
        // float lWall = -20.0 + boundaryMargin; float rWall = 20.0 - boundaryMargin; float bWall = -20.0 + boundaryMargin; float tWall = 200.0;
        // if (newXStar.x < lWall) {
        //     newXStar.y += (x.y - newXStar.y) / (x.x - newXStar.x) * abs(newXStar.x - lWall);
        //     newXStar.x = lWall;
        // } else if (newXStar.x > rWall) {
        //     newXStar.y -= (x.y - newXStar.y) / (x.x - newXStar.x) * abs(newXStar.x - rWall);
        //     newXStar.x = rWall;
        // }
        // if (newXStar.y < bWall) {
        //     newXStar.x += (x.x - newXStar.x) / (x.y - newXStar.y) * abs(newXStar.y - bWall);
        //     newXStar.y = bWall;
        // } else if (newXStar.y > tWall) {
        //     newXStar.x -= (x.x - newXStar.x) / (x.y - newXStar.y) * abs(newXStar.y - tWall);
        //     newXStar.y = tWall;
        // }

        if (debug) {
            if (mod(computeIndex, 2.0) == 0.0) {
                gl_FragColor = interpretFloat(newXStar.x);
            } else {
                gl_FragColor = interpretFloat(newXStar.y);
            }
            return;
        }

        // This hurts me... we're doing the exact same calculation twice since
        //  these textures only have enough space for one float per fragment.
        // It's may be possible to go RGFormat and FloatType, since we won't
        //  have to call readPixels for this shader (GPUC5)...?
        if (mod(computeIndex, 2.0) == 0.0) {
            gl_FragColor = interpretFloat(newXStar.x);
        } else {
            gl_FragColor = interpretFloat(newXStar.y);
        }
    } else if (mask == 1.0) { // Pass through velocity
        // Note GPUC5 (this one) *has* to have the same size, structure and contents as GPUC1
        //  so that we can iterate on xStar multiple times. Thus, we can use `uv` here confidently.
        gl_FragColor = texture2D(xStarAndVelocity, uv).xyzw;
    }
}
