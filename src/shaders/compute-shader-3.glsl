#define PI 3.1415926538
#define EPSILON 0.0001

flat varying vec2 pi_xReference;
flat varying vec2 pi_yReference;
flat varying vec2 pj_xReference;
flat varying vec2 pj_yReference;
uniform float h;
uniform float NUL;

uniform sampler2D GPUC3_Mask;
uniform sampler2D xStarAndVelocity;

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
    if (pi_xReference.x == NUL) {
        gl_FragColor = interpretFloat(NUL);
        return;
    }
    
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    float mask = texture2D(GPUC3_Mask, uv).x * 255.0;

    float pi_x = interpretBytesVector(texture2D(xStarAndVelocity, pi_xReference).xyzw);
    float pi_y = interpretBytesVector(texture2D(xStarAndVelocity, pi_yReference).xyzw);
    vec2 p_i = vec2(pi_x, pi_y);

    float pj_x = interpretBytesVector(texture2D(xStarAndVelocity, pj_xReference).xyzw);
    float pj_y = interpretBytesVector(texture2D(xStarAndVelocity, pj_yReference).xyzw);
    vec2 p_j = vec2(pj_x, pj_y);

    float r = length(p_i - p_j);
    if (mask == 1.0) {
        // W(pᵢ - pⱼ)
        if (0.0 <= r && r <= h) {
            gl_FragColor = interpretFloat((315.0 / (64.0 * PI * pow(h, 9.0))) * 
                            pow(pow(h, 2.0) - pow(r, 2.0), 3.0));
        } else {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        }
    } else if (mask == 2.0 || mask == 3.0) {
        // ∇W(pᵢ - pⱼ)
        if (EPSILON <= r && r <= h) {
            float dr_dpi;
            if (mask == 2.0) {
                dr_dpi = (p_i.x - p_j.x) / (r + EPSILON);
            } else if (mask == 3.0) {
                dr_dpi = (p_i.y - p_j.y) / (r + EPSILON);
            }

            float dW_dr = (-45.0 / (PI * pow(h, 6.0))) * pow(h - r, 2.0);
            gl_FragColor = interpretFloat(dr_dpi * dW_dr);
        } else {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        }
    }
}
