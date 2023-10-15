uniform vec3 color;
flat varying vec2 vRefX;
flat varying vec2 vRefY;

uniform sampler2D texturePosition;
uniform sampler2D textureVelocity;
uniform vec2 iMouse;
uniform float iTime;

#include <clipping_planes_pars_fragment>

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

vec2 getCoord(float index, vec2 res) {
    float refX = mod(index, res.x) + 0.5;
    float refY = trunc(index / res.x) + 0.5;
    vec2 refCoord = vec2(refX, refY) / res;
    return refCoord;
}

vec3 colorFunc() { /* will be automatically filled in */ }

vec2 pos; vec2 vel;
void main() {
    #include <clipping_planes_fragment>
    bool isColorDynamic; // automatically assigned
    
    vec4 posXBytes = texture2D(texturePosition, vRefX).xyzw;
    vec4 posYBytes = texture2D(texturePosition, vRefY).xyzw;

    float xPos = interpretBytesVector(posXBytes);
    float yPos = interpretBytesVector(posYBytes);
    pos = vec2(xPos, yPos);

    float xVel = interpretBytesVector(texture2D(textureVelocity, vRefX).xyzw);
    float yVel = interpretBytesVector(texture2D(textureVelocity, vRefY).xyzw);
    vel = vec2(xVel, yVel);

    vec3 color_;
    if (isColorDynamic) color_ = colorFunc();
    else color_ = color;

    gl_FragColor = vec4(color_, 1.0);
}
