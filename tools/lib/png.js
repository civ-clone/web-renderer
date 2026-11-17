// Just enough PNG for the hosted sets' sheets (#1063): reading the 8-bit RGBA PNGs a pack is drawn as, and writing a
//  sheet of them. Anything else is refused, saying what, rather than read wrongly.

const zlib = require('zlib');

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;

  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }

  return c >>> 0;
});

const crc32 = (buffer) => {
  let c = 0xffffffff;

  for (const byte of buffer) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }

  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const length = Buffer.alloc(4),
    crc = Buffer.alloc(4),
    body = Buffer.concat([Buffer.from(type, 'ascii'), data]);

  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(body), 0);

  return Buffer.concat([length, body, crc]);
};

// The Paeth predictor, as the PNG specification gives it.
const paeth = (a, b, c) => {
  const p = a + b - c,
    pa = Math.abs(p - a),
    pb = Math.abs(p - b),
    pc = Math.abs(p - c);

  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/**
 * `buffer`, a PNG, as `{ width, height, data }`: `data` its pixels, four bytes each (red, green, blue, alpha), row by
 *  row. Throws for anything but an 8-bit RGBA, non-interlaced PNG, naming `name`.
 */
const readPng = (buffer, name = 'The PNG') => {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error(`${name} is not a PNG.`);
  }

  let width = 0,
    height = 0;
  const idat = [];

  for (let at = 8; at < buffer.length; ) {
    const length = buffer.readUInt32BE(at),
      type = buffer.toString('ascii', at + 4, at + 8),
      data = buffer.subarray(at + 8, at + 8 + length);

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);

      const [depth, colourType, , , interlace] = data.subarray(8, 13);

      if (depth !== 8 || colourType !== 6 || interlace !== 0) {
        throw new Error(
          `${name} is not an 8-bit RGBA, non-interlaced PNG (bit depth ${depth}, colour type ${colourType}, interlace ${interlace}).`
        );
      }
    }

    if (type === 'IDAT') {
      idat.push(data);
    }

    at += length + 12;
  }

  const raw = zlib.inflateSync(Buffer.concat(idat)),
    stride = width * 4,
    data = Buffer.alloc(stride * height);

  if (raw.length !== (stride + 1) * height) {
    throw new Error(`${name}'s pixels are not ${width} × ${height}.`);
  }

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)],
      row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)),
      out = y * stride;

    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? data[out + x - 4] : 0,
        up = y > 0 ? data[out - stride + x] : 0,
        upLeft = x >= 4 && y > 0 ? data[out - stride + x - 4] : 0;
      let value;

      switch (filter) {
        case 0:
          value = row[x];
          break;
        case 1:
          value = row[x] + left;
          break;
        case 2:
          value = row[x] + up;
          break;
        case 3:
          value = row[x] + ((left + up) >> 1);
          break;
        case 4:
          value = row[x] + paeth(left, up, upLeft);
          break;
        default:
          throw new Error(`${name} has a row with filter ${filter}.`);
      }

      data[out + x] = value & 0xff;
    }
  }

  return { width, height, data };
};

/** `{ width, height, data }`, RGBA pixels row by row, as an 8-bit RGBA PNG. */
const writePng = ({ width, height, data }) => {
  const stride = width * 4,
    raw = Buffer.alloc((stride + 1) * height),
    header = Buffer.alloc(13);

  for (let y = 0; y < height; y++) {
    // Filter 0, none: each row as it is.
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

module.exports = { readPng, writePng };
