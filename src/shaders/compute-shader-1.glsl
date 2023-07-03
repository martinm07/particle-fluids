uniform sampler2D forcesTexture;
uniform sampler2D positionsTexture;
uniform sampler2D velocitiesTexture;
flat varying vec2 pReference;

uniform sampler2D GPUC1_Mask;

uniform float deltaT;

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

    float position = interpretBytesVector(texture2D(positionsTexture, pReference).xyzw);
    float force = interpretBytesVector(texture2D(forcesTexture, pReference).xyzw);
    float velocity = interpretBytesVector(texture2D(velocitiesTexture, pReference).xyzw);

    float mask = texture2D(GPUC1_Mask, uv).x * 255.0;

    if (mask == 1.0) {
        velocity += deltaT * force;
        gl_FragColor = interpretFloat(velocity);
    } else if (mask == 2.0) {
        float xStar = position + velocity * deltaT;
        gl_FragColor = interpretFloat(xStar);
    }
    // gl_FragColor = interpretFloat(2.0 * gl_FragCoord.y / resolution.y - 1.0);

    // gl_FragColor = interpretFloat(position);
}
