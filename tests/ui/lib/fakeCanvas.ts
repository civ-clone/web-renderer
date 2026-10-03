// Just enough of the DOM for a map layer to draw under node: a canvas whose
// context records each call, and a `#preload` container holding images of a
// given size. Imported before anything that reaches for `document`.

export type Call = [string, ...any[]];

export class FakeImage {
  constructor(
    readonly path: string,
    readonly naturalWidth: number,
    readonly naturalHeight: number
  ) {}
}

const images: FakeImage[] = [];

/** Puts an image at `./assets/<path>.png` in the preload container. */
export const preloadImage = (
  path: string,
  width: number,
  height: number
): FakeImage => {
  const image = new FakeImage(path, width, height);

  images.push(image);

  return image;
};

/** A canvas whose context appends every draw call to `calls`. */
export const fakeCanvas = (width: number, height: number) => {
  const calls: Call[] = [],
    context: { [key: string]: any } = {
      measureText: (text: string) => ({ width: String(text).length * 10 }),
    };

  ['clearRect', 'drawImage', 'fillRect', 'fillText'].forEach((name) => {
    context[name] = (...args: any[]) => calls.push([name, ...args]);
  });

  return {
    calls,
    canvas: {
      width,
      height,
      getContext: () => context,
    } as unknown as HTMLCanvasElement,
  };
};

const preload = {
  querySelectorAll: () => [],
  querySelector: (selector: string) =>
    images.find((image) => selector.includes(`${image.path}.png`)) ?? null,
};

Object.assign(globalThis, {
  document: {
    querySelector: (selector: string) =>
      selector === '#preload' ? preload : null,
  },
  HTMLImageElement: FakeImage,
});
