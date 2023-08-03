uniform sampler2D xStarAndVelocity;
uniform vec2 c1Resolution;
uniform float P;
uniform float deltaT;

vec2 getCoord(float index, vec2 res) {
    float refX = mod(index, res.x) + 0.5;
    float refY = trunc(index / res.x) + 0.5;
    vec2 refCoord = vec2(refX, refY) / res;
    return refCoord;
}
vec4 interpretFloat(float num) {
    uint numBits = floatBitsToUint(num);
    return vec4(float((255u & numBits) >> 0) / 255.0,
                float((65280u & numBits) >> 8) / 255.0,
                float((16711680u & numBits) >> 16) / 255.0,
                float((4278190080u & numBits) >> 24) / 255.0);
}
float rand(vec2 co){
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}
void main() {
    float computeIndex = (gl_FragCoord.x - 0.5) + (gl_FragCoord.y - 0.5) * resolution.x;
    gl_FragColor = texture2D(xStarAndVelocity, getCoord(computeIndex + P, c1Resolution)).xyzw;
    // gl_FragColor = interpretFloat(rand(vec2(deltaT, deltaT)) * 10.0);
}
