function uint2bytes(x) {
    if (x < 0) {
        throw new Error('Input number is less than 0!');
    }

    const bytes = [];
    do {
        bytes.push(x & 255);
        x = x >> 8;
    } while (x);
    return bytes.reverse();
}

module.exports = { uint2bytes };
