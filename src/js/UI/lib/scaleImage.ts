type ScalingOptions = {
  smoothing?: boolean;
};

export const scaleImage = (
  image: CanvasImageSource,
  scale: number,
  options?: ScalingOptions
): HTMLCanvasElement => {
  const newCanvas = document.createElement('canvas')!,
    context = newCanvas.getContext('2d')!;

  newCanvas.width = (image.width as number) * scale;
  newCanvas.height = (image.height as number) * scale;

  if (!options?.smoothing) {
    context.imageSmoothingEnabled = false;
  }

  context.drawImage(image, 0, 0, newCanvas.width, newCanvas.height);

  return newCanvas;
};

export default scaleImage;
