import { imageSize } from './imageSize';

type ScalingOptions = {
  smoothing?: boolean;
};

export const scaleImage = (
  image: CanvasImageSource,
  scale: number,
  options?: ScalingOptions
): HTMLCanvasElement => {
  const newCanvas = document.createElement('canvas')!,
    context = newCanvas.getContext('2d')!,
    [width, height] = imageSize(image);

  // A source that has not decoded has no intrinsic size. Return something
  // minimal and drawable rather than a default-sized canvas, which consumers
  // would embed as a visibly empty 300x150 box.
  if (width === 0 || height === 0) {
    newCanvas.width = 1;
    newCanvas.height = 1;

    return newCanvas;
  }

  newCanvas.width = width * scale;
  newCanvas.height = height * scale;

  if (!options?.smoothing) {
    context.imageSmoothingEnabled = false;
  }

  context.drawImage(image, 0, 0, newCanvas.width, newCanvas.height);

  return newCanvas;
};

export default scaleImage;
