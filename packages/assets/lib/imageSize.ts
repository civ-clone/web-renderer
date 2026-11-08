// `HTMLImageElement.width` is the *layout* width, so it reads 0 for an element
// that is not being rendered — a detached `cloneNode()`, say. `naturalWidth` is
// the intrinsic size, and is 0 only until the image has actually decoded, which
// is the state callers need to know about.
export const imageSize = (image: CanvasImageSource): [number, number] =>
  image instanceof HTMLImageElement
    ? [image.naturalWidth, image.naturalHeight]
    : [image.width as number, image.height as number];

// A source with no dimensions has no pixels to read: `getImageData` throws on a
// zero-sized rect and `drawImage` throws on a zero-sized source.
export const isDrawable = (image: CanvasImageSource): boolean => {
  const [width, height] = imageSize(image);

  return width > 0 && height > 0;
};

export default imageSize;
