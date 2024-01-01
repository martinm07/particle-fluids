attribute vec2 referenceX;
attribute vec2 referenceY;
flat varying vec2 vRefX;
flat varying vec2 vRefY;

uniform sampler2D texturePosition;
uniform sampler2D textureVelocity;
uniform float size;
uniform mat2 transform;
uniform vec2 translate;

uniform vec2 iMouse;
uniform float iTime;

#include <clipping_planes_pars_vertex>

// As it turns out, since WebGL 2.0 (which is based on OpenGL ES 3.0, as opposed to OpenGL ES 2.0),
//  there is already a function that does this, namely "uintBitsToFloat", and the reverse ("floatBitsToUint").
// This here is still fully functional, and will remain as legacy.
float uIntBitsToFloat32(uint bits) {
    float floatVal = 0.0;
    float exponent = 0.0;
    float mantissa = 1.0;
    for (int i = 31; i >= 0; i--) {
        // if the `i`th bit is on
        if (bool(bits & uint(1 << i))) {
            if (i == 31) { // first bit is the sign
                floatVal = -1.0;
            } else if ((22 < i) && (i < 31)) { // next 8 bits is the exponent
                // when i = 30, we want to raise 2 to the 7
                exponent += pow(2.0, float(i - 30 + 7));
            } else { // final 23 bits is the mantissa
                // when i = 22, we want 2^(-1)
                // when i = 21, we want 2^(-2), etc.
                mantissa += pow(2.0, -float(23 - i));
            }
        } else { // if sign = 0, then the number is positive
            if (i == 31) {
                floatVal = 1.0;
            }
        }
    }
    floatVal *= pow(2.0, exponent - 127.0); // 2^7 - 1 (bias)
    floatVal *= mantissa;
    return floatVal;
}

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

float sizeFunc() { /* will be automatically filled in */ }

vec2 pos; vec2 vel;
void main() {
    // #include <begin_vertex>

    bool isSizeDynamic; // automatically assigned

    vRefX = referenceX;
    vRefY = referenceY;
    vec4 posXBytes = texture2D(texturePosition, referenceX).xyzw;
    vec4 posYBytes = texture2D(texturePosition, referenceY).xyzw;

    float xPos = interpretBytesVector(posXBytes);
    float yPos = interpretBytesVector(posYBytes);
    pos = vec2(xPos, yPos);

    float xVel = interpretBytesVector(texture2D(textureVelocity, referenceX).xyzw);
    float yVel = interpretBytesVector(texture2D(textureVelocity, referenceY).xyzw);
    vel = vec2(xVel, yVel);

    float size_;
    if (isSizeDynamic) size_ = sizeFunc();
    else size_ = size;
    
    vec3 newPosition = size_ * 0.2 * position;

    vec2 transformedPos = transform * pos + translate;
    newPosition += vec3(transformedPos, 0.0);

    // #include <project_vertex>
    vec4 mvPosition = modelViewMatrix * vec4(newPosition, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
}
