import { TilesetDescriptor, spriteKey } from '../tilesets/TilesetDescriptor';
import currentTileset from './tilesets';
import { s } from '@dom111/element';

export let preloadContainer: HTMLElement;
// The preloaded images by their whole key (`spriteKey`), which is what their `data-path` holds.
const preloadedImageMap = new Map<string, HTMLImageElement>();
// The keys a lookup has missed and said so: a sprite that is not there is reported once, not on every draw of it.
const reportedMissing = new Set<string>();
let missingImagePlaceholder: HTMLCanvasElement | null = null;

// Anything caching a canvas *derived* from a preloaded image has to drop it when
// the underlying images change, or it would keep serving the previous theme's
// sprites. Registered here rather than exported as a list of caches so the
// derived modules stay leaves of the import graph.
const invalidationHandlers = new Set<() => void>();

export const onPreloadedImagesChanged = (handler: () => void): void => {
  invalidationHandlers.add(handler);
};

export const setPreloadContainer = (preloadContainerElement: HTMLElement) => {
  // `Map`'s constructor calls this, so it runs once per layer with the same
  // element; only a genuine change should invalidate the derived caches.
  if (preloadContainer !== preloadContainerElement) {
    invalidationHandlers.forEach((handler) => handler());
    reportedMissing.clear();
  }

  preloadContainer = preloadContainerElement;
  preloadedImageMap.clear();

  preloadContainer
    .querySelectorAll<HTMLImageElement>('img[data-path]')
    .forEach((image) => {
      const key = image.getAttribute('data-path');

      // The first with a key, as a lookup by selector would find.
      if (!key || preloadedImageMap.has(key)) {
        return;
      }

      preloadedImageMap.set(key, image);
    });
};

/**
 * The preloaded image of `tileset`'s sprite `path` (`units/settlers`, `city/food`), found by its whole key, or a blank
 * canvas when there is none. Only the whole key matches: another pack's sprite of the same name is kept under another
 * prefix, and is never taken for this one (#56).
 */
export const getPreloadedImage = (
  path: string,
  tileset: TilesetDescriptor = currentTileset()
): CanvasImageSource => {
  const key = spriteKey(tileset, path);

  if (!preloadedImageMap.has(key)) {
    // The store's records are appended as it reads them, which can be after the container was indexed, so a key not
    //  indexed yet is looked for again. A miss is not kept, so the image is found once it arrives.
    const image = preloadContainer.querySelector(
      `img[data-path="${key.replace(/["\\]/g, '\\$&')}"]`
    ) as HTMLImageElement | null;

    if (image) {
      preloadedImageMap.set(key, image);
    }
  }

  const image = preloadedImageMap.get(key) ?? null;

  if (image === null) {
    if (!reportedMissing.has(key)) {
      reportedMissing.add(key);

      console.error(`Missing image: ${path}.`);
    }

    if (!missingImagePlaceholder) {
      missingImagePlaceholder = s<HTMLCanvasElement>('<canvas></canvas>');
    }

    return missingImagePlaceholder;
  }

  // Returned as-is, *not* as a clone. `cloneNode()` gives a detached element,
  // which is neither rendered nor decoded, so its `width` reads 0 on first use
  // and `getImageData` in `replaceColours` throws on the zero-sized rect. No
  // caller mutates the element either — they all draw from it — so a clone per
  // lookup was pure allocation on the render hot path.
  return image;
};

export default getPreloadedImage;
