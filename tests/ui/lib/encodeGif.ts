// A GIF encoder for synthetic sheets, copied from civ-clone/civ2-asset-extractor's tests (tests/lib/encodeGif.ts, MIT),
//  so the Civ2 import is tested on sheets made here: no Civilization II art is needed, nor the extractor's test files.

export type Colour = [r: number, g: number, b: number];

export type GifOptions = {
  width: number;
  height: number;
  palette: Colour[];
  pixels: ArrayLike<number>;
  version?: 'GIF87a' | 'GIF89a';
  // Put the palette on the image instead of the screen.
  localPalette?: boolean;
  interlaced?: boolean;
  // Extension blocks written before the image, as [label, ...sub-blocks].
  extensions?: [number, ...number[][]][];
  // Never send a clear code when the dictionary fills, as some encoders don't.
  noClearWhenFull?: boolean;
};

// LZW-compresses palette indices the way GIF does: variable-width codes packed
// least significant bit first, with the code size growing as the dictionary
// does.
export const compress = (
  pixels: ArrayLike<number>,
  minimumCodeSize: number,
  noClearWhenFull = false
): number[] => {
  const clearCode = 1 << minimumCodeSize,
    endCode = clearCode + 1,
    bytes: number[] = [];

  let buffer = 0,
    bits = 0,
    codeSize = minimumCodeSize + 1,
    nextCode = endCode + 1,
    dictionary = new Map<string, number>();

  const emit = (code: number) => {
      buffer |= code << bits;
      bits += codeSize;

      while (bits >= 8) {
        bytes.push(buffer & 0xff);
        buffer >>= 8;
        bits -= 8;
      }
    },
    codeFor = (key: string) =>
      key.includes(',') ? dictionary.get(key)! : Number(key);

  emit(clearCode);

  let current = String(pixels[0]);

  for (let i = 1; i < pixels.length; i++) {
    const key = `${current},${pixels[i]}`;

    if (dictionary.has(key)) {
      current = key;

      continue;
    }

    emit(codeFor(current));

    if (nextCode === 4096) {
      if (!noClearWhenFull) {
        emit(clearCode);
        dictionary = new Map();
        codeSize = minimumCodeSize + 1;
        nextCode = endCode + 1;
      }
    } else {
      if (nextCode >= 1 << codeSize) {
        codeSize++;
      }

      dictionary.set(key, nextCode++);
    }

    current = String(pixels[i]);
  }

  emit(codeFor(current));
  emit(endCode);

  if (bits > 0) {
    bytes.push(buffer & 0xff);
  }

  return bytes;
};

const uint16 = (value: number) => [value & 0xff, value >> 8];

export const encodeGif = ({
  width,
  height,
  palette,
  pixels,
  version = 'GIF87a',
  localPalette = false,
  interlaced = false,
  extensions = [],
  noClearWhenFull = false,
}: GifOptions): Uint8Array => {
  const depth = Math.max(1, Math.ceil(Math.log2(palette.length))),
    paddedPalette = Array.from(
      { length: 1 << depth },
      (_, i) => palette[i] ?? [0, 0, 0]
    ).flat(),
    paletteFlags = 0x80 | (depth - 1),
    minimumCodeSize = Math.max(2, depth),
    data = compress(pixels, minimumCodeSize, noClearWhenFull),
    blocks: number[] = [];

  for (let i = 0; i < data.length; i += 255) {
    const block = data.slice(i, i + 255);

    blocks.push(block.length, ...block);
  }

  return Uint8Array.from([
    ...Array.from(version, (character) => character.charCodeAt(0)),
    ...uint16(width),
    ...uint16(height),
    localPalette ? 0 : paletteFlags,
    0,
    0,
    ...(localPalette ? [] : paddedPalette),
    ...extensions.flatMap(([label, ...subBlocks]) => [
      0x21,
      label,
      ...subBlocks.flatMap((block) => [block.length, ...block]),
      0,
    ]),
    0x2c,
    ...uint16(0),
    ...uint16(0),
    ...uint16(width),
    ...uint16(height),
    (localPalette ? paletteFlags : 0) | (interlaced ? 0x40 : 0),
    ...(localPalette ? paddedPalette : []),
    minimumCodeSize,
    ...blocks,
    0,
    0x3b,
  ]);
};

export default encodeGif;
