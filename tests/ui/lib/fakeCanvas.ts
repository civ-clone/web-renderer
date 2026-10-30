// Just enough of the DOM for a map layer to draw under node: a canvas whose
// context records each call, and loaded sprites of a given size. Imported
// before anything that reaches for `document`.

import { setSprites } from '../../../src/js/UI/lib/getPreloadedImage';

export type Call = [string, ...any[]];

export class FakeImage {
  constructor(
    readonly path: string,
    readonly naturalWidth: number,
    readonly naturalHeight: number
  ) {}
}

const images: FakeImage[] = [],
  asked: string[] = [];

// The sprites the layers draw from, as `AssetStore.load` leaves them (#730), noting every key a lookup asks for.
class Sprites extends Map<string, CanvasImageSource> {
  get(key: string): CanvasImageSource | undefined {
    asked.push(key);

    return super.get(key);
  }
}

const sprites = new Sprites();

setSprites(sprites);

/** Loads an image as the sprite `./assets/<path>.png`. */
export const preloadImage = (
  path: string,
  width: number,
  height: number
): FakeImage => {
  const image = new FakeImage(path, width, height);

  images.push(image);
  sprites.set(`./assets/${path}.png`, image as unknown as CanvasImageSource);

  return image;
};

/** A canvas whose context appends every draw call to `calls`. */
export const fakeCanvas = (width: number, height: number) => {
  const calls: Call[] = [],
    context: { [key: string]: any } = {
      measureText: (text: string) => ({ width: String(text).length * 10 }),
    };

  // The clip a layer redraws a region under (#486) is recorded, not applied.
  [
    'clearRect',
    'drawImage',
    'fillRect',
    'fillText',
    'save',
    'beginPath',
    'rect',
    'clip',
    'restore',
  ].forEach((name) => {
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

/** Every key a lookup has asked for, in the order asked. */
export const askedFor = (): string[] => [...asked];

/** The paths of the images loaded. */
export const preloaded = (): string[] => images.map(({ path }) => path);

Object.assign(globalThis, {
  document: {
    querySelector: () => null,
  },
  HTMLImageElement: FakeImage,
});
