#define MAX_NEIGHBOURS 64

// flat varying float[MAX_NEIGHBOURS * 2] pRefN_W;
// flat varying float[MAX_NEIGHBOURS * 2] pRefN_dWx;
// flat varying float[MAX_NEIGHBOURS * 2] pRefN_dWy;
// flat varying float[MAX_NEIGHBOURS] extrasMask;
flat varying float pRefN_startIndex;
// flat varying float pRefN_Length;
// uniform vec2 nResolution;

// uniform float restDensity;
// uniform float constraintRelaxation;

// uniform float NUL;
// uniform sampler2D GPUC3_Out;
// uniform sampler2D GPUC4_Mask;
// uniform sampler2D pRefN;

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

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    float mask = texture2D(GPUC4_Mask, uv).x * 255.0;

    if (mask == 1.0) {
        // λᵢ
        float C_i = 0.0;
        float sum_dCi2 = 0.0;
        vec2 dpi_Ci = vec2(0.0, 0.0);
        for (int j = 0; j < MAX_NEIGHBOURS; j++) {
            // if (pRefN_W[j*2] == NUL) {
            //     break;
            // }

            // float W_ij = interpretBytesVector(texture2D(GPUC3_Out, vec2(pRefN_W[j*2], pRefN_W[j*2 + 1])).xyzw);
            // float dWi_x = interpretBytesVector(texture2D(GPUC3_Out, vec2(pRefN_dWx[j*2], pRefN_dWx[j*2 + 1])).xyzw);
            // float dWi_y = interpretBytesVector(texture2D(GPUC3_Out, vec2(pRefN_dWy[j*2], pRefN_dWy[j*2 + 1])).xyzw);
            float W_ij = 1.0;
            float dWi_x = 1.0;
            float dWi_y = 1.0;

            C_i += W_ij;

            // To make this technically correct, we should multiply by -1.0, and add a following conditional for 
            //  `if (extrasMask[j] == 1.0)`, in which case we multiply by -1.0 again. However, this isn't necessary
            //  as we're just gonna square.
            dWi_x *= 1.0 / restDensity; dWi_y *= 1.0 / restDensity;
            sum_dCi2 += pow(dWi_x, 2.0) + pow(dWi_y, 2.0);
            // However, the sign should matter here, thus...
            // if (extrasMask[j] != 1.0) {
            //     dWi_x *= -1.0; dWi_y *= -1.0;
            // }
            dpi_Ci += vec2(dWi_x, dWi_y);
        }

        C_i *= 1.0 / restDensity;
        C_i -= 1.0;

        sum_dCi2 += pow(dpi_Ci.x, 2.0) + pow(dpi_Ci.y, 2.0);
        float lambda = C_i / (sum_dCi2 + constraintRelaxation);
        gl_FragColor = interpretFloat(lambda);
    } else if (mask == 2.0) {
        // s_corr
    }
}
