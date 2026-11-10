import { assetStore } from '../../AssetStore';
import currentTileset from '../../lib/tilesets';
import { groupIcons } from '../../lib/groupIcons';
import { s } from '@dom111/element';
import { spriteKey } from '../../tilesets/TilesetDescriptor';

// Near enough to white, for a sprite that's been scaled or imported from another tileset.
const WHITE = 200;

/**
 * Trade lost, drawn from the tileset's own Trade picture (#792): the white of its top arrow turned black, which is the
 *  white in the upper half of `pixels` (RGBA, a row at a time) and all that touches it, as the arrow's tail runs lower.
 *  In place: give it a copy, as the render caches are shared.
 */
export const darkenTopArrow = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): void => {
  const isWhite = (x: number, y: number): boolean => {
      const index = (y * width + x) * 4;

      return (
        x >= 0 &&
        y >= 0 &&
        x < width &&
        y < height &&
        pixels[index + 3] > 0 &&
        pixels[index] >= WHITE &&
        pixels[index + 1] >= WHITE &&
        pixels[index + 2] >= WHITE
      );
    },
    pending: [number, number][] = [];

  for (let y = 0; y < Math.floor(height / 2); y++) {
    for (let x = 0; x < width; x++) {
      pending.push([x, y]);
    }
  }

  while (pending.length > 0) {
    const [x, y] = pending.pop()!;

    if (!isWhite(x, y)) {
      continue;
    }

    const index = (y * width + x) * 4;

    pixels[index] = pixels[index + 1] = pixels[index + 2] = 0;

    for (const [stepX, stepY] of [
      [-1, -1],
      [0, -1],
      [1, -1],
      [-1, 0],
      [1, 0],
      [-1, 1],
      [0, 1],
      [1, 1],
    ]) {
      pending.push([x + stepX, y + stepY]);
    }
  }
};

// Made once for each tileset's picture and width, as the reports draw their headings on every render.
const urls = new Map<string, Promise<string>>();

const corruptionURL = (path: string, width: number): Promise<string> => {
  const key = `${path}@${width}`;

  if (!urls.has(key)) {
    const url = assetStore.has(path).then(async (has) => {
      // The store draws a blank for one that's missing, which would be kept.
      if (!has) {
        throw new Error(`No sprite at ${path}`);
      }

      const sprite = await assetStore.getShownAt(path, width);
      const canvas = document.createElement('canvas'),
        context = canvas.getContext('2d')!;

      canvas.width = sprite.width;
      canvas.height = sprite.height;
      context.drawImage(sprite, 0, 0);

      const image = context.getImageData(0, 0, canvas.width, canvas.height);

      darkenTopArrow(image.data, canvas.width, canvas.height);
      context.putImageData(image, 0, 0);

      return canvas.toDataURL('image/png');
    });

    // A picture that wasn't there yet is tried again next time.
    url.catch(() => urls.delete(key));
    urls.set(key, url);
  }

  return urls.get(key)!;
};

/** The Corruption column's icon, as `yieldIcon` draws a yield's: decorative, as the heading's words are its name. */
export const corruptionIcon = (): HTMLElement => {
  const icon = s('<span class="yield-icon corruption-icon"></span>');

  corruptionURL(
    spriteKey(currentTileset(), groupIcons.Trade),
    currentTileset().ui.icon
  )
    .then((url) => icon.append(s(`<img src="${url}" alt="">`)))
    // A tileset without the picture: the tooltip and the figures still say it.
    .catch(() => {});

  return icon;
};

export default corruptionIcon;
