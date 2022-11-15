import { e } from './html';

export let preloadContainer: HTMLElement;

export const setPreloadContainer = (preloadContainerElement: HTMLElement) =>
  (preloadContainer = preloadContainerElement);

export const getPreloadedImage = (path: string): CanvasImageSource => {
  const image = preloadContainer.querySelector(`[data-path$="${path}.png"]`);

  if (image === null) {
    console.error(`Missing image: ${path}.`);

    return e('canvas') as HTMLCanvasElement;
  }

  return image as HTMLImageElement;
};

export default getPreloadedImage;
