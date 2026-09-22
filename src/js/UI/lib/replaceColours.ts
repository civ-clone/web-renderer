import { imageSize, isDrawable } from './imageSize';
import { onPreloadedImagesChanged } from './getPreloadedImage';
import { s } from '@dom111/element';

const recolouredImageCache = new Map<string, HTMLCanvasElement>();

onPreloadedImagesChanged(() => recolouredImageCache.clear());

/**
 * Recolours `image`, mapping each colour in `source` to the one at the same
 * index in `replacement`.
 *
 * The result may be a shared cache entry, so callers must treat it as
 * immutable and composite onto their own canvas if they need to draw on top.
 */
export const replaceColours = (
  image: CanvasImageSource,
  source: string[],
  replacement: string[]
) => {
  // Only image elements have a stable identity (`src`) to key the cache by;
  // caching canvas sources under a random key would insert a new entry on
  // every call without ever hitting, growing the cache unboundedly.
  // `source` is part of the key too: the same image recoloured with the same
  // replacement but a different set of source colours is a different result.
  const key =
    image instanceof HTMLImageElement
      ? [image.src, source.toString(), replacement.toString()].join('|')
      : null;

  if (key !== null && recolouredImageCache.has(key)) {
    return recolouredImageCache.get(key)!;
  }

  const canvas = s<HTMLCanvasElement>('<canvas></canvas>'),
    context = canvas.getContext('2d')!;

  // The preload is asynchronous, so a render can reach here before the image has
  // decoded. Hand back something drawable rather than throwing on the zero-sized
  // `getImageData`, and don't cache it — the next render has the decoded image.
  if (!isDrawable(image)) {
    canvas.width = 1;
    canvas.height = 1;

    return canvas;
  }

  const [width, height] = imageSize(image);

  canvas.width = width;
  canvas.height = height;

  context.drawImage(image, 0, 0, width, height);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height),
    getColor = (input: string | number[]) => {
      let match: RegExpMatchArray | null = null,
        color: { r: number; g: number; b: number; a: number } = {
          r: 0,
          g: 0,
          b: 0,
          a: 0,
        };

      if (typeof input === 'string') {
        if (
          (match = input.match(
            /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i
          )) !== null
        ) {
          color = {
            r: parseInt(match[1], 16),
            g: parseInt(match[2], 16),
            b: parseInt(match[3], 16),
            a: 1,
          };
        } else if (
          (match = input.match(
            /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/
          )) !== null
        ) {
          color = {
            r: parseInt(match[1] + match[1], 16),
            g: parseInt(match[2] + match[2], 16),
            b: parseInt(match[3] + match[3], 16),
            a: 1,
          };
        } else if (
          (match = input.match(
            /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/
          )) !== null
        ) {
          color = {
            r: parseInt(match[1]),
            g: parseInt(match[2]),
            b: parseInt(match[3]),
            a: 1,
          };
        } else if (
          (match = input.match(
            /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+|\d+\.|\.\d+|\d+\.\d+)\s*\)\s*$/
          )) !== null
        ) {
          color = {
            r: parseInt(match[1]),
            g: parseInt(match[2]),
            b: parseInt(match[3]),
            a: parseFloat(match[4] ?? 1),
          };
        }
      } else if ('length' in input) {
        color = {
          r: input[0] || 0,
          g: input[1] || 0,
          b: input[2] || 0,
          a: input[3] || 1,
        };
      }

      return color;
    };

  let sourceColors = source.map(getColor),
    replaceColors = replacement.map(getColor);

  for (let i = 0; i < imageData.data.length; i += 4) {
    sourceColors.forEach((color, n) => {
      if (
        imageData.data[i] === color.r &&
        imageData.data[i + 1] === color.g &&
        imageData.data[i + 2] === color.b &&
        imageData.data[i + 3] === color.a * 255
      ) {
        imageData.data[i] = (replaceColors[n] || replaceColors[0]).r;
        imageData.data[i + 1] = (replaceColors[n] || replaceColors[0]).g;
        imageData.data[i + 2] = (replaceColors[n] || replaceColors[0]).b;
        imageData.data[i + 3] = Math.trunc(
          (replaceColors[n] || replaceColors[0]).a * 255
        );
      }
    });
  }

  context.putImageData(imageData, 0, 0);

  if (key !== null) {
    recolouredImageCache.set(key, canvas);
  }

  return canvas;
};

export default replaceColours;
