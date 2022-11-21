import { s } from '@dom111/element';

export let preloadContainer: HTMLElement;

export const setPreloadContainer = (preloadContainerElement: HTMLElement) =>
  (preloadContainer = preloadContainerElement);

export const getPreloadedImage = (path: string): CanvasImageSource => {
  const image = preloadContainer.querySelector(`[data-path$="${path}.png"]`);

  if (image === null) {
    console.error(`Missing image: ${path}.`);

    return s<HTMLCanvasElement>('<canvas></canvas>');
  }

  return image as HTMLImageElement;
};

export default getPreloadedImage;
