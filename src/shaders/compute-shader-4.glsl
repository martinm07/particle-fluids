#define MAX_NEIGHBOURS 64
#define PI 3.1415926538

flat varying float pRefN_startIndex;
flat varying float pRefN_Length;
flat varying float numExtras;
uniform vec2 nRefRes;
uniform vec2 c3Resolution;
uniform float N;

uniform float h;
uniform float restDensity;
uniform float constraintRelaxation;
uniform float APk;
uniform float APdeltaQ;
uniform float APn;

uniform sampler2D GPUC3_Out;
uniform sampler2D GPUC4_Mask;
uniform sampler2D pRefN;

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
    // const float pos_infinity = uintBitsToFloat(0x7F800000);
    // const float neg_infinity = uintBitsToFloat(0xFF800000);

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    float mask = texture2D(GPUC4_Mask, uv).x * 255.0;

    if (mask == 1.0) {
        isnan(pRefN_startIndex);
        // λᵢ
        float C_i = 0.0;
        float sum_dCi2 = 0.0;
        vec2 dpi_Ci = vec2(0.0, 0.0);
        for (float j = 0.0; j < pRefN_Length; j++) {
            vec2 refCoord = getCoord(pRefN_startIndex + j, nRefRes);
            vec2 coord = texture2D(pRefN, refCoord).xy;
            vec2 indexCoord = coord * c3Resolution - 0.5;
            float index = indexCoord.x + indexCoord.y * c3Resolution.x;

            float W_ij = interpretBytesVector(texture2D(GPUC3_Out, coord).xyzw);

            vec2 dWx_coord = getCoord(index + (N / 4.0), c3Resolution);
            float dWi_x = interpretBytesVector(texture2D(GPUC3_Out, dWx_coord).xyzw);

            vec2 dWy_coord = getCoord(index + 2.0 * N / 4.0, c3Resolution);
            float dWi_y = interpretBytesVector(texture2D(GPUC3_Out, dWy_coord).xyzw);

            C_i += W_ij;

            // To make this technically correct, we should multiply by -1.0, and add a following conditional for 
            //  `if (extrasMask[j] == 1.0)`, in which case we multiply by -1.0 again. However, this isn't necessary
            //  as we're just gonna square.
            dWi_x *= 1.0 / restDensity; dWi_y *= 1.0 / restDensity;
            sum_dCi2 += pow(dWi_x, 2.0) + pow(dWi_y, 2.0);
            // However, the sign should matter here, thus...
            if (j < pRefN_Length - numExtras) { // if this is NOT an "extra"...
                dWi_x *= -1.0; dWi_y *= -1.0;
            }
            dpi_Ci += vec2(dWi_x, dWi_y);
        }

        C_i *= 1.0 / restDensity;
        C_i -= 1.0;

        sum_dCi2 += pow(dpi_Ci.x, 2.0) + pow(dpi_Ci.y, 2.0);
        float lambda = -1.0 * C_i / (sum_dCi2 + constraintRelaxation);
        gl_FragColor = interpretFloat(lambda);
    // ∑ⱼ(sCorr∇W(pᵢ - pⱼ))
    } else if (mask == 2.0) {
        // isnan(pRefN_startIndex);
        float APqW = (315.0 / (64.0 * PI * pow(h, 9.0))) * pow(pow(h, 2.0) - pow(APdeltaQ, 2.0), 3.0);
        float s_corr = 0.0;
        for (float j = 0.0; j < pRefN_Length; j++) {
            vec2 refCoord = getCoord(pRefN_startIndex + j, nRefRes);
            vec2 coord = texture2D(pRefN, refCoord).xy;
            float W_ij = interpretBytesVector(texture2D(GPUC3_Out, coord).xyzw);
            // if (isnan(W_ij) || isinf(W_ij)) W_ij = 10.0;

            vec2 indexCoord = coord * c3Resolution - 0.5;
            float index = indexCoord.x + indexCoord.y * c3Resolution.x;
            vec2 dWx_coord = getCoord(index + (N / 4.0), c3Resolution);
            float dWi_x = interpretBytesVector(texture2D(GPUC3_Out, dWx_coord).xyzw);
            if (j >= pRefN_Length - numExtras) {
                dWi_x *= -1.0;
            }

            // if (isnan(dWi_x) || isinf(dWi_x)) dWi_x = 1.0;
            s_corr += -1.0 * APk * pow(W_ij / APqW, APn) * dWi_x;
        }
        // s_corr += 10.0;
        // for (int i = 0; i < 5; i++) {
        //     s_corr -= float(i);
        // }
        // if (isnan(s_corr) || isinf(s_corr)) s_corr = 0.0;
        gl_FragColor = interpretFloat(s_corr);
    } else if (mask == 3.0) {
        float APqW = (315.0 / (64.0 * PI * pow(h, 9.0))) * pow(pow(h, 2.0) - pow(APdeltaQ, 2.0), 3.0);
        float s_corr = 0.0;
        for (float j = 0.0; j < pRefN_Length; j++) {
            vec2 refCoord = getCoord(pRefN_startIndex + j, nRefRes);
            vec2 coord = texture2D(pRefN, refCoord).xy;
            float W_ij = interpretBytesVector(texture2D(GPUC3_Out, coord).xyzw);
            // if (isnan(W_ij) || isinf(W_ij)) W_ij = 10.0;

            vec2 indexCoord = coord * c3Resolution - 0.5;
            float index = indexCoord.x + indexCoord.y * c3Resolution.x;
            vec2 dWy_coord = getCoord(index + 2.0 * N / 4.0, c3Resolution);
            float dWi_y = interpretBytesVector(texture2D(GPUC3_Out, dWy_coord).xyzw);
            if (j >= pRefN_Length - numExtras) {
                dWi_y *= -1.0;
            }

            // if (isnan(dWi_y) || isinf(dWi_y)) dWi_y = 1.0;
            s_corr += -1.0 * APk * pow(W_ij / APqW, APn) * dWi_y;
        }
        // if (isnan(s_corr)) s_corr = 1. / 0.;
        // isnan(pRefN_startIndex);
        // s_corr = 1. / 0.;
        gl_FragColor = interpretFloat(s_corr);
    }
}
