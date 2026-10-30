import { TilesetDescriptor, spriteKey } from '../tilesets/TilesetDescriptor';
import currentTileset from './tilesets';
import { s } from '@dom111/element';

// The sprites of the tileset in use, decoded, by their whole key (`spriteKey`): filled by `AssetStore.load` (#730),
//  which awaits them all before the first draw, so a sprite is either here or missing, never on its way.
let sprites: Map<string, CanvasImageSource> = new Map();
// The keys a lookup has missed and said so: a sprite that is not there is reported once, not on every draw of it.
const reportedMissing = new Set<string>();
let missingImagePlaceholder: HTMLCanvasElement | null = null;

// Anything caching a canvas *derived* from a sprite has to drop it when the sprites change, or it would keep serving
//  the previous tileset's. Registered here rather than exported as a list of caches so the derived modules stay leaves
//  of the import graph.
const invalidationHandlers = new Set<() => void>();

export const onPreloadedImagesChanged = (handler: () => void): void => {
  invalidationHandlers.add(handler);
};

/** Replaces the sprites lookups draw from with `loaded`, and drops everything derived from the ones before. */
export const setSprites = (loaded: Map<string, CanvasImageSource>): void => {
  sprites = loaded;
  reportedMissing.clear();
  invalidationHandlers.forEach((handler) => handler());
};

/**
 * The decoded sprite `path` (`units/settlers`, `city/food`) of `tileset`, found by its whole key, or a blank canvas when
 * there is none. Only the whole key matches: another pack's sprite of the same name is kept under another prefix, and
 * is never taken for this one (#56).
 */
export const getPreloadedImage = (
  path: string,
  tileset: TilesetDescriptor = currentTileset()
): CanvasImageSource => {
  const key = spriteKey(tileset, path),
    image = sprites.get(key);

  if (image !== undefined) {
    // The shared sprite, not a copy: nothing draws onto it, and a copy per lookup was allocation on the render hot
    //  path.
    return image;
  }

  if (!reportedMissing.has(key)) {
    reportedMissing.add(key);

    console.error(`Missing image: ${path}.`);
  }

  if (!missingImagePlaceholder) {
    missingImagePlaceholder = s<HTMLCanvasElement>('<canvas></canvas>');
  }

  return missingImagePlaceholder;
};

export default getPreloadedImage;
