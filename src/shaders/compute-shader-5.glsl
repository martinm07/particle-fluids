#define LINESLISTLEN 100 

flat varying vec2 lambdaRef;
flat varying vec2 sCorr_xRef;
flat varying vec2 sCorr_yRef;
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

uniform float NUL;
uniform float[LINESLISTLEN] lineBounds;
uniform sampler2D GPUC5_Mask;
uniform sampler2D GPUC3_Out;
uniform sampler2D GPUC4_Out;
uniform sampler2D pRefN;
uniform sampler2D pRefPN;

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

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    float mask = texture2D(GPUC5_Mask, uv).x * 255.0;
    if (mask == 1.0) { // Update xStar
        float computeIndex = (gl_FragCoord.x - 0.5) + (gl_FragCoord.y - 0.5) * resolution.x;

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
        }
        float sCorr_x = interpretBytesVector(texture2D(GPUC4_Out, sCorr_xRef).xyzw);
        float sCorr_y = interpretBytesVector(texture2D(GPUC4_Out, sCorr_yRef).xyzw);
        deltaP += vec2(sCorr_x, sCorr_y);
        deltaP *= 1.0 / restDensity;

        // IMP: In difference to the original algorithm, we adjust xStar by deltaP *before* collision response.
        ///     It may be worth it to look at both behaviours.
        vec2 xStar_xCoord = getCoord(2.0 * floor(computeIndex / 2.0) + P, c1Resolution);
        float xStar_x = interpretBytesVector(texture2D(xStarAndVelocity, xStar_xCoord));

        vec2 xStar_yCoord = getCoord(2.0 * floor(computeIndex / 2.0) + 1.0 + P, c1Resolution);
        float xStar_y = interpretBytesVector(texture2D(xStarAndVelocity, xStar_yCoord));

        vec2 newXStar = vec2(xStar_x + xStar_y) + deltaP;
        float x_x = interpretBytesVector(texture2D(X, getCoord(2.0 * floor(computeIndex / 2.0), pRes)));
        float x_y = interpretBytesVector(texture2D(X, getCoord(2.0 * floor(computeIndex / 2.0) + 1.0, pRes)));
        vec2 x = vec2(x_x, x_y);

        //// Perform collision detection & response on `newXStar`

        bool xAxisCloser = abs(newXStar.y - x.y) < abs(newXStar.x - x.x);
        float w; float a;
        // If we are closer to the y-axis, then we'll switch to a line of `x = my + b`.
        //  This avoids the bound on infinity as we approach a vertical line.
        if (xAxisCloser) {
            w = (newXStar.y - x.y) / (newXStar.x - x.x);
            a = x.y - w * x.x;
        } else {
            w = (newXStar.x - x.x) / (newXStar.y - x.y);
            a = x.x - w * x.y;
        }
        float xXxXStar = abs(x.x - newXStar.x); float yXyXStar = abs(x.y - newXStar.y);
        vec2 intersected[LINESLISTLEN / 4];
        int numIntersected = 0;
        vec2 holdingPoint = vec2(0.0, 0.0);
        float holdingDistance = 0.0;
        for (int k = 0; k < LINESLISTLEN / 4; k += 4) {
            if (lineBounds[k] == NUL) {
                break;
            }
            float xp1 = lineBounds[k]; float yp1 = lineBounds[k + 1];
            float xp2 = lineBounds[k + 2]; float yp2 = lineBounds[k + 3];

            float m; float b;
            bool pXAxisCloser = abs(yp2 - yp1) < abs(xp2 - xp1);
            if (pXAxisCloser) {
                m = (yp2 - yp1) / (xp2 - xp1);
                if ((xAxisCloser && m == w) || (!xAxisCloser && m * w == 1.0)) {
                    break;
                }
                b = yp1 - m * xp1;
            } else {
                m = (xp2 - xp1) / (yp2 - yp1);
                if ((xAxisCloser && m * w == 1.0) || (!xAxisCloser && m == w)) {
                    break;
                }
                b = xp1 - m * yp1;
            }
            
            float xPrime; float yPrime;
            if (pXAxisCloser && xAxisCloser) {
                xPrime = (a - b) / (m - w);
                yPrime = (m * a - w * b) / (m - w);
            } else if (pXAxisCloser && !xAxisCloser) {
                xPrime = (a + w * b) / (1.0 - m * w);
                yPrime = (b + m * a) / (1.0 - m * w);
            } else if (!pXAxisCloser && xAxisCloser) {
                xPrime = (b + m * a) / (1.0 - m * w);
                yPrime = (a + w * b) / (1.0 - m * w);
            } else {
                xPrime = (w * b - m * a) / (w - m);
                yPrime = (b - a) / (w - m);
            }

            float xp1xp2 = abs(xp1 - xp2); float yp1yp2 = abs(yp1 - yp2);
            if (abs(xp1 - xPrime) < xp1xp2 && abs(xp2 - xPrime) < xp1xp2 && 
                abs(yp1 - yPrime) < yp1yp2 && abs(yp2 - yPrime) < yp1yp2 &&
                abs(x.x - xPrime) < xXxXStar && abs(newXStar.x - xPrime) < xXxXStar && 
                abs(x.y - yPrime) < yXyXStar && abs(newXStar.y - yPrime) < yXyXStar) {
                
                // intersection is true
                intersected[numIntersected] = vec2(xPrime, yPrime);
                float distance = length(intersected[numIntersected] - x);
                if (numIntersected == 0 || distance < holdingDistance) {
                    holdingPoint = intersected[numIntersected];
                    holdingDistance = distance;
                }
                numIntersected += 1;
            }
        }
        if (numIntersected > 0) {
            newXStar = holdingPoint;
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
    } else if (mask == 2.0) { // Pass through velocity
        // Note GPUC5 (this one) *has* to have the same size, structure and contents as GPUC1
        //  so that we can iterate on xStar multiple times. Thus, we can use `uv` here confidently.
        gl_FragColor = texture2D(xStarAndVelocity, uv).xyzw;
    }
}
