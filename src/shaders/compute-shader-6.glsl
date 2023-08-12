#define PI 3.1415926538
#define EPSILON 0.0001

uniform sampler2D xStarAndVelocity;
uniform sampler2D X;

flat varying float pRefN_startIndex;
flat varying float pRefN_Length;
flat varying float numExtras;
uniform sampler2D pRefPN;
uniform vec2 nRefRes;
// uniform vec2 pRes;
uniform vec2 c1Resolution;
uniform float P;

uniform float deltaT;
uniform float h;
uniform float vorticityCoefficient;
uniform float viscosityCoefficient;

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
vec2 vPow(vec2 x, float y) {
    return vec2(pow(x.x, y), pow(x.y, y));
}

void main() {
    float computeIndex = (gl_FragCoord.x - 0.5) + (gl_FragCoord.y - 0.5) * resolution.x;

    vec2 vi_xCoord = getCoord(2.0 * floor(computeIndex / 2.0), c1Resolution);
    float vi_x = interpretBytesVector(texture2D(xStarAndVelocity, vi_xCoord).xyzw);
    vec2 vi_yCoord = getCoord(2.0 * floor(computeIndex / 2.0) + 1.0, c1Resolution);
    float vi_y = interpretBytesVector(texture2D(xStarAndVelocity, vi_yCoord).xyzw);
    vec2 v_i = vec2(vi_x, vi_y);

    vec2 pi_xCoord = getCoord(2.0 * floor(computeIndex / 2.0) + P, c1Resolution);
    float pi_x = interpretBytesVector(texture2D(xStarAndVelocity, pi_xCoord).xyzw);
    vec2 pi_yCoord = getCoord(2.0 * floor(computeIndex / 2.0) + 1.0 + P, c1Resolution);
    float pi_y = interpretBytesVector(texture2D(xStarAndVelocity, pi_yCoord).xyzw);
    vec2 p_i = vec2(pi_x, pi_y);

    vec2 iHat = vec2(1.0, 0.0); vec2 jHat = vec2(0.0, 1.0);

    vec2 dVorticity = vec2(0.0, 0.0);
    float vorticity = 0.0;
    vec2 viscosity = vec2(0.0, 0.0);

    for (float j = 0.0; j < pRefN_Length; j++) {
        vec2 refCoord = getCoord(pRefN_startIndex + j, nRefRes);
        float pIndex = texture2D(pRefPN, refCoord).x;

        vec2 vj_xCoord = getCoord(2.0 * pIndex, c1Resolution);
        float vj_x = interpretBytesVector(texture2D(xStarAndVelocity, vj_xCoord).xyzw);
        vec2 vj_yCoord = getCoord(2.0 * pIndex + 1.0, c1Resolution);
        float vj_y = interpretBytesVector(texture2D(xStarAndVelocity, vj_yCoord).xyzw);
        vec2 v_j = vec2(vj_x, vj_y);

        vec2 pj_xCoord = getCoord(2.0 * pIndex + P, c1Resolution);
        float pj_x = interpretBytesVector(texture2D(xStarAndVelocity, pj_xCoord).xyzw);
        vec2 pj_yCoord = getCoord(2.0 * pIndex + 1.0 + P, c1Resolution);
        float pj_y = interpretBytesVector(texture2D(xStarAndVelocity, pj_yCoord).xyzw);
        vec2 p_j = vec2(pj_x, pj_y);

        if (pRefN_Length - j <= numExtras) {
            vec2 temp;
            temp = p_i;
            p_i = p_j;
            p_j = temp;

            temp = v_i;
            v_i = v_j;
            v_j = temp;
        }

        float r = length(p_i - p_j);
        vec2 dpi_dpj_W = -90.0 / (PI * pow(h, 6.0)) * (h - r) * vPow((p_i - p_j) / r, 2.0);
        vec2 dpj_W = 45.0 / (PI * pow(h, 6.0)) * pow(h - r, 2.0) * (p_i - p_j) / r;
        float W = 315.0 / (64.0 * PI * pow(h, 9.0)) * pow(pow(h, 2.0) - pow(r, 2.0), 3.0);

        vec2 v_ij = v_j - v_i;

        dVorticity += v_ij.x * jHat * dpi_dpj_W - v_ij.y * iHat * dpi_dpj_W;
        vorticity += v_ij.x * dpj_W.y - v_ij.y * dpj_W.x;
        viscosity += v_ij * W;
    }

    vec2 dVorticityNormal = dVorticity / (length(dVorticity) + EPSILON);
    vec2 f_vorticity = vorticityCoefficient * (dVorticityNormal * vorticity);

    vec2 f_viscosity = viscosityCoefficient * viscosity;

    float prevX = interpretBytesVector(texture2D(X, gl_FragCoord.xy / resolution.xy).xyzw);
    if (mod(computeIndex, 2.0) == 0.0) {
        float finalVelocity = (1.0 / (deltaT + EPSILON)) * (p_i.x - prevX);
        // finalVelocity += (deltaT * f_vorticity.x) + (f_viscosity.x);
        finalVelocity += f_viscosity.x;
        gl_FragColor = interpretFloat(finalVelocity);
    } else {
        float finalVelocity = (1.0 / (deltaT + EPSILON)) * (p_i.y - prevX);
        // finalVelocity += (deltaT * f_vorticity.y) + (f_viscosity.y);
        finalVelocity += f_viscosity.y;
        gl_FragColor = interpretFloat(finalVelocity);
    }

    if (debug) {
        if (mod(computeIndex, 2.0) == 0.0) {
            gl_FragColor = interpretFloat(pRefN_startIndex);
        } else {
            gl_FragColor = interpretFloat(pRefN_Length);
        }
    }
}
