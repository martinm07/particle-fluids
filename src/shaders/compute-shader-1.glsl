flat varying float force;
uniform sampler2D positionsTexture;
uniform sampler2D velocitiesTexture;

uniform sampler2D GPUC1_Mask;

uniform float deltaT;
uniform float P;
uniform vec2 pRes;

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

    float mask = texture2D(GPUC1_Mask, uv).x * 255.0;

    if (mask == 1.0) {
        float computeIndex = (gl_FragCoord.x - 0.5) + (gl_FragCoord.y - 0.5) * resolution.x;

        vec2 pCoord = getCoord(computeIndex, pRes);
        float velocity = interpretBytesVector(texture2D(velocitiesTexture, pCoord).xyzw);
        gl_FragColor = interpretFloat(velocity + deltaT * force);

    } else if (mask == 2.0) {
        float computeIndex = (gl_FragCoord.x - 0.5) + (gl_FragCoord.y - 0.5) * resolution.x - P;
        vec2 pCoord = getCoord(computeIndex, pRes);
        float position = interpretBytesVector(texture2D(positionsTexture, pCoord).xyzw);
        float velocity = interpretBytesVector(texture2D(velocitiesTexture, pCoord).xyzw);
        gl_FragColor = interpretFloat(position + deltaT * velocity + deltaT * deltaT * force);
    }
}
