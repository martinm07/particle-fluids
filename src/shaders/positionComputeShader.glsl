uniform sampler2D texturePosition;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 pos = texture2D(texturePosition, uv).xyzw;
    gl_FragColor = pos;
}