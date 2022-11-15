import { e } from './html';

export const replaceColours = (
  image: CanvasImageSource,
  source: string[],
  replacement: string[]
) => {
  const canvas = e('canvas') as HTMLCanvasElement,
    context = canvas.getContext('2d') as CanvasRenderingContext2D;

  canvas.width = image.width as number;
  canvas.height = image.height as number;

  context.drawImage(image, 0, 0, image.width as number, image.height as number);

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

  return canvas;
};

export default replaceColours;
