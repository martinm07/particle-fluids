varying float varyingPosition;

void main() {
    // 4278190080 = 2 ** 31 + 2 ** 30 + 2 ** 29 + 2 ** 28 + 2 ** 27 + 2 ** 26 + 2 ** 25 + 2 ** 24 
    // 16711680 = 2 ** 23 + 2 ** 22 + 2 ** 21 + 2 ** 20 + 2 ** 19 + 2 ** 18 + 2 ** 17 + 2 ** 16 
    // 65280 = 2 ** 15 + 2 ** 14 + 2 ** 13 + 2 ** 12 + 2 ** 11 + 2 ** 10 + 2 ** 9 + 2 ** 8 
    // 255 = 2 ** 7 + 2 ** 6 + 2 ** 5 + 2 ** 4 + 2 ** 3 + 2 ** 2 + 2 ** 1 + 2 ** 0

    uint coordBits = floatBitsToUint(varyingPosition);
    gl_FragColor = vec4(float((255u & coordBits) >> 0) / 255.0,
                        float((65280u & coordBits) >> 8) / 255.0,
                        float((16711680u & coordBits) >> 16) / 255.0,
                        float((4278190080u & coordBits) >> 24) / 255.0);
}
