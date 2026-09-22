import { s } from '@dom111/element';

export let preloadContainer: HTMLElement;
const preloadedImageMap = new Map<string, HTMLImageElement>();
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
  }

  preloadContainer = preloadContainerElement;
  preloadedImageMap.clear();

  preloadContainer
    .querySelectorAll<HTMLImageElement>('img[data-path]')
    .forEach((image) => {
      const path = image.getAttribute('data-path');

      if (!path) {
        return;
      }

      preloadedImageMap.set(path, image);
    });
};

export const getPreloadedImage = (path: string): CanvasImageSource => {
  if (!preloadedImageMap.has(path)) {
    const image = preloadContainer.querySelector(
      `[data-path$="${path}.png"]`
    ) as HTMLImageElement | null;

    if (image) {
      preloadedImageMap.set(path, image);
    }
  }

  const image = preloadedImageMap.get(path) ?? null;

  if (image === null) {
    console.error(`Missing image: ${path}.`);

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
