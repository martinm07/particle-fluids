unsigned long int combine(unsigned char b1, unsigned char b2, unsigned char b3, unsigned char b4);
int bit_return(int a, int loc);

int main()
{
    // 1 0111111 11000000000000000000000 = -1.75
    unsigned char b1 = 191;
    unsigned char b2 = 224;
    unsigned char b3 = 0;
    unsigned char b4 = 0;

    unsigned long int out = combine(b1, b2, b3, b4);
    float * out_float = &out;
    printf("%f\n", *out_float);

    int * encode_in = &(*out_float);
    unsigned char enc_b1;
    unsigned char enc_b2;
    unsigned char enc_b3;
    unsigned char enc_b4;
    int i; int j;
    for (i = 31, j = 7; i >= 24; i--, j--) {
        printf("%d", bit_return(*encode_in, i));
        enc_b1 += bit_return(*encode_in, i) << j;
    }
    printf(" ");
    for (i = 23, j = 7; i >= 16; i--, j--) {
        printf("%d", bit_return(*encode_in, i));
        enc_b2 += bit_return(*encode_in, i) << j;
    }
    printf(" ");
    for (i = 15, j = 7; i >= 8; i--, j--) {
        printf("%d", bit_return(*encode_in, i));
        enc_b3 += bit_return(*encode_in, i) << j;
    }
    printf(" ");
    for (i = 7, j = 7; i >= 0; i--, j--) {
        printf("%d", bit_return(*encode_in, i));
        enc_b4 += bit_return(*encode_in, i) << j;
    }
    return 0;
}

unsigned long int combine(unsigned char b1, unsigned char b2, unsigned char b3, unsigned char b4) {
    return ((((unsigned long int)b1 << 24) | 
        ((unsigned long int)b2 << 16)) | 
        ((unsigned long int)b3 << 8)) | 
        (unsigned long int)b4;
}
int bit_return(int a, int loc) {
    int buf = a & 1<<loc;

    if (buf == 0) return 0;
    else return 1; 
}
