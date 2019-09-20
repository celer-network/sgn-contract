function uint2bytes(x) {
  if (x < 0) {
    throw "Input number is less than 0!";
  }

  var bytes = [];
  do {
    bytes.push(x & 255);
    x = x >> 8;
  } while (x)
  return bytes.reverse();
}

module.exports = {
  uint2bytes
}
