attribute vec2 reference;

uniform sampler2D texturePosition;

void main() {
    vec3 pos = texture2D(texturePosition, reference).xyz;
    vec3 newPosition = position;
    newPosition += 256.0 * pos;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}
