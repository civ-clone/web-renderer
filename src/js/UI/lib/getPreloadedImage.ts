import { s } from '@dom111/element';

export let preloadContainer: HTMLElement;
const preloadedImageMap = new Map<string, HTMLImageElement>();
let missingImagePlaceholder: HTMLCanvasElement | null = null;

export const setPreloadContainer = (preloadContainerElement: HTMLElement) => {
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

  // return a clone so it can be modified by consumers
  return image.cloneNode() as CanvasImageSource;
};

export default getPreloadedImage;
