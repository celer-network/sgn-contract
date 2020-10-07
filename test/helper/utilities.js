function toHexString(byteArray) {
  return Array.from(byteArray, function(byte) {
    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('')
}

function toByteArray(hexString) {
  var result = [];
  if (hexString.substr(0, 2) == '0x') {
    hexString = hexString.slice(2)
  }
  if (hexString.length % 2 == 1) {
    hexString = '0' + hexString
  }
  for (var i = 0; i < hexString.length; i += 2) {
    result.push(parseInt(hexString.substr(i, 2), 16));
  }
  return result;
}

function uint2bytes(x) {
    return toByteArray(x.toString(16))
}

module.exports = { uint2bytes };
