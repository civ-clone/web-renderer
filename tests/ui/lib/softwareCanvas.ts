// A canvas with pixels, for testing what the map layers leave on their canvases under node, which has no canvas of its
//  own (#91). Each pixel holds an id and an alpha rather than a colour: a sprite's pixel is a hash of its path and the
//  pixel's place in the sprite, so the wrong sprite, or the right one in the wrong place, shows; and anything drawn
//  with less than full alpha is mixed with what was under it by a hash that cares about order, so drawing in the wrong
//  order, or drawing something see-through twice, shows too.
//
// It models what the layers use: `drawImage` in all three forms (nearest neighbour, as the layers draw with smoothing
//  off), `clearRect`, `fillRect`, `fillText` (a box the size `measureText` gives), `beginPath`/`rect`/`fill`, a clip of
//  one rectangle at a time, `save`/`restore`, and the `copy` composite that `scrollTo` blits with. A pixel belongs to a
//  shape when its centre does, as it does on a real canvas without anti-aliasing. Anything else a layer calls is not a
//  function here, so a new kind of drawing fails loudly rather than drawing nothing.

import { FakeImage } from './fakeCanvas';

export type Rect = { x: number; y: number; width: number; height: number };

/** How opaque a sprite's pixel is, from 0 (not drawn) to 1. */
export type Mask = (
  path: string,
  x: number,
  y: number,
  width: number,
  height: number
) => number;

let spriteMask: Mask = () => 1;

// Each sprite's pixels, worked out once: `${path} ${width}x${height}` to its ids and alphas.
const sprites = new Map<string, { ids: Uint32Array; alpha: Uint8Array }>();

/** The opacity of every sprite's pixels from now on. */
export const setSpriteMask = (mask: Mask): void => {
  spriteMask = mask;
  sprites.clear();
};

/** A 32-bit hash of some numbers that depends on their order, never 0 (which is a clear pixel). */
export const mix = (...values: number[]): number => {
  let hash = 0x811c9dc5;

  values.forEach((value) => {
    hash = Math.imul(hash ^ (value | 0), 0x01000193);
    hash ^= hash >>> 13;
    hash = Math.imul(hash, 0x5bd1e995);
    hash ^= hash >>> 15;
  });

  return hash >>> 0 || 1;
};

const stringHashes = new Map<string, number>();

export const stringHash = (value: string): number => {
  let hash = stringHashes.get(value);

  if (hash === undefined) {
    hash = mix(...Array.from(value, (character) => character.charCodeAt(0)));

    stringHashes.set(value, hash);
  }

  return hash;
};

/** A colour, as `fillStyle` takes it, as an id and an alpha (0-255). */
const parseColour = (style: string): [number, number] => {
  const rgba = String(style).match(
    /^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/
  );

  if (rgba) {
    return [
      stringHash(`rgb(${rgba[1]},${rgba[2]},${rgba[3]})`),
      Math.round(Number(rgba[4]) * 255),
    ];
  }

  return [stringHash(String(style)), 255];
};

const fontSize = (font: string): number =>
  Number(String(font).match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 10);

type State = {
  clip: Rect | null;
  fillStyle: string;
  font: string;
  globalCompositeOperation: string;
  imageSmoothingEnabled: boolean;
  textAlign: string;
  textBaseline: string;
};

export type Counters = {
  /** Calls per context method. */
  calls: { [method: string]: number };
  /** Pixels `clearRect` cleared, inside the clip. */
  clearedPixels: number;
  /** Pixels a draw wrote to, inside the clip. */
  paintedPixels: number;
};

/** Text is drawn as a box of this alpha, as anti-aliased glyphs are mostly see-through. */
const textAlpha = 192;

export class SoftwareCanvas {
  #width: number;
  #height: number;
  ids: Uint32Array;
  alpha: Uint8Array;
  counters: Counters = { calls: {}, clearedPixels: 0, paintedPixels: 0 };
  #context: SoftwareContext;

  constructor(width: number = 0, height: number = 0) {
    this.#width = width;
    this.#height = height;
    this.ids = new Uint32Array(width * height);
    this.alpha = new Uint8Array(width * height);
    this.#context = new SoftwareContext(this);
  }

  get width(): number {
    return this.#width;
  }

  // Setting either size clears the canvas and its context's state, as it does on a real one.
  set width(width: number) {
    this.#resize(width, this.#height);
  }

  get height(): number {
    return this.#height;
  }

  set height(height: number) {
    this.#resize(this.#width, height);
  }

  getContext(): SoftwareContext {
    return this.#context;
  }

  resetCounters(): void {
    this.counters = { calls: {}, clearedPixels: 0, paintedPixels: 0 };
  }

  /** A copy of the pixels, to compare with later. */
  snapshot(): Pixels {
    return {
      width: this.#width,
      height: this.#height,
      ids: this.ids.slice(),
      alpha: this.alpha.slice(),
    };
  }

  #resize(width: number, height: number): void {
    this.#width = width;
    this.#height = height;
    this.ids = new Uint32Array(width * height);
    this.alpha = new Uint8Array(width * height);
    this.#context.reset();
  }
}

export type Pixels = {
  width: number;
  height: number;
  ids: Uint32Array;
  alpha: Uint8Array;
};

/** The index of every pixel that differs between two pictures of the same size. */
export const differences = (a: Pixels, b: Pixels): number[] => {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(
      `cannot compare ${a.width}x${a.height} with ${b.width}x${b.height}`
    );
  }

  const differing: number[] = [];

  for (let index = 0; index < a.ids.length; index++) {
    if (a.ids[index] !== b.ids[index] || a.alpha[index] !== b.alpha[index]) {
      differing.push(index);
    }
  }

  return differing;
};

type Source = Pixels;

// Draws a pixel of `id` at `alpha` over what is at `index`, and says whether it drew anything (1) or not (0).
const blend = (
  ids: Uint32Array,
  alphas: Uint8Array,
  index: number,
  id: number,
  alpha: number
): number => {
  if (alpha === 0) {
    return 0;
  }

  if (alpha === 255) {
    ids[index] = id;
    alphas[index] = 255;

    return 1;
  }

  const under = alphas[index];

  ids[index] = mix(ids[index], under, id, alpha);
  alphas[index] = Math.min(
    255,
    Math.round(alpha + (under * (255 - alpha)) / 255)
  );

  return 1;
};

export class SoftwareContext {
  #canvas: SoftwareCanvas;
  #path: Rect[] = [];
  #stack: State[] = [];
  #state: State = SoftwareContext.#initialState();

  constructor(canvas: SoftwareCanvas) {
    this.#canvas = canvas;
  }

  static #initialState(): State {
    return {
      clip: null,
      fillStyle: '#000',
      font: '10px sans-serif',
      globalCompositeOperation: 'source-over',
      imageSmoothingEnabled: true,
      textAlign: 'start',
      textBaseline: 'alphabetic',
    };
  }

  /** What resizing a canvas does to its context: the same object, with its state as new. */
  reset(): void {
    this.#path = [];
    this.#stack = [];
    this.#state = SoftwareContext.#initialState();
  }

  get fillStyle(): string {
    return this.#state.fillStyle;
  }

  set fillStyle(value: string) {
    this.#state.fillStyle = value;
  }

  get font(): string {
    return this.#state.font;
  }

  set font(value: string) {
    this.#state.font = value;
  }

  get globalCompositeOperation(): string {
    return this.#state.globalCompositeOperation;
  }

  set globalCompositeOperation(value: string) {
    if (value !== 'source-over' && value !== 'copy') {
      throw new Error(`globalCompositeOperation ${value} is not modelled`);
    }

    this.#state.globalCompositeOperation = value;
  }

  get imageSmoothingEnabled(): boolean {
    return this.#state.imageSmoothingEnabled;
  }

  set imageSmoothingEnabled(value: boolean) {
    this.#state.imageSmoothingEnabled = value;
  }

  get textAlign(): string {
    return this.#state.textAlign;
  }

  set textAlign(value: string) {
    this.#state.textAlign = value;
  }

  get textBaseline(): string {
    return this.#state.textBaseline;
  }

  set textBaseline(value: string) {
    this.#state.textBaseline = value;
  }

  save(): void {
    this.#count('save');
    this.#stack.push({ ...this.#state });
  }

  restore(): void {
    this.#count('restore');

    const state = this.#stack.pop();

    if (state) {
      this.#state = state;
    }
  }

  beginPath(): void {
    this.#count('beginPath');
    this.#path = [];
  }

  rect(x: number, y: number, width: number, height: number): void {
    this.#count('rect');
    this.#path.push({ x, y, width, height });
  }

  clip(): void {
    this.#count('clip');

    if (this.#path.length !== 1) {
      throw new Error(
        `a clip of ${this.#path.length} rectangles is not modelled`
      );
    }

    const [rect] = this.#path,
      clip = this.#state.clip;

    if (clip === null) {
      this.#state.clip = { ...rect };

      return;
    }

    const left = Math.max(clip.x, rect.x),
      top = Math.max(clip.y, rect.y),
      right = Math.min(clip.x + clip.width, rect.x + rect.width),
      bottom = Math.min(clip.y + clip.height, rect.y + rect.height);

    this.#state.clip = {
      x: left,
      y: top,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
    };
  }

  fill(): void {
    this.#count('fill');

    const [id, alpha] = parseColour(this.#state.fillStyle);

    this.#path.forEach((rect) => this.#paintRect(rect, id, alpha));
  }

  clearRect(x: number, y: number, width: number, height: number): void {
    this.#count('clearRect');

    const [firstX, lastX, firstY, lastY] = this.#bounds({
        x,
        y,
        width,
        height,
      }),
      canvas = this.#canvas,
      { ids, alpha } = canvas,
      stride = canvas.width;

    for (let py = firstY; py < lastY; py++) {
      ids.fill(0, py * stride + firstX, py * stride + lastX);
      alpha.fill(0, py * stride + firstX, py * stride + lastX);
    }

    canvas.counters.clearedPixels +=
      Math.max(0, lastX - firstX) * Math.max(0, lastY - firstY);
  }

  fillRect(x: number, y: number, width: number, height: number): void {
    this.#count('fillRect');

    const [id, alpha] = parseColour(this.#state.fillStyle);

    this.#paintRect({ x, y, width, height }, id, alpha);
  }

  measureText(text: string): { width: number } {
    this.#count('measureText');

    return { width: String(text).length * fontSize(this.#state.font) * 0.6 };
  }

  fillText(text: string, x: number, y: number): void {
    this.#count('fillText');

    const size = fontSize(this.#state.font),
      width = String(text).length * size * 0.6,
      align = this.#state.textAlign,
      left =
        align === 'center'
          ? x - width / 2
          : align === 'right' || align === 'end'
          ? x - width
          : x,
      baseline = this.#state.textBaseline,
      top =
        baseline === 'top'
          ? y
          : baseline === 'middle'
          ? y - size / 2
          : y - size * 0.75;

    this.#paintRect(
      { x: left, y: top, width, height: size },
      mix(stringHash(String(text)), stringHash(this.#state.fillStyle)),
      textAlpha
    );
  }

  drawImage(image: unknown, ...args: number[]): void {
    this.#count('drawImage');

    const source = this.#source(image);

    let sx = 0,
      sy = 0,
      sw = source.width,
      sh = source.height,
      dx: number,
      dy: number,
      dw = source.width,
      dh = source.height;

    if (args.length === 2) {
      [dx, dy] = args;
    } else if (args.length === 4) {
      [dx, dy, dw, dh] = args;
    } else if (args.length === 8) {
      [sx, sy, sw, sh, dx, dy, dw, dh] = args;
    } else {
      throw new Error(`drawImage with ${args.length + 1} arguments`);
    }

    const canvas = this.#canvas,
      ids = canvas.ids,
      alphas = canvas.alpha,
      stride = canvas.width,
      copy = this.#state.globalCompositeOperation === 'copy',
      [firstX, lastX, firstY, lastY] = this.#bounds({
        x: dx,
        y: dy,
        width: dw,
        height: dh,
      });

    if (copy) {
      // Everything the clip lets through is replaced, so what the image doesn't cover is cleared.
      const [left, right, top, bottom] = this.#bounds({
        x: 0,
        y: 0,
        width: canvas.width,
        height: canvas.height,
      });

      for (let py = top; py < bottom; py++) {
        ids.fill(0, py * stride + left, py * stride + right);
        alphas.fill(0, py * stride + left, py * stride + right);
      }
    }

    let painted = 0;

    for (let py = firstY; py < lastY; py++) {
      const sourceY = sy + Math.floor(((py + 0.5 - dy) * sh) / dh);

      for (let px = firstX; px < lastX; px++) {
        const sourceX = sx + Math.floor(((px + 0.5 - dx) * sw) / dw),
          index = py * stride + px;

        let id = 0,
          alpha = 0;

        if (
          sourceX >= 0 &&
          sourceY >= 0 &&
          sourceX < source.width &&
          sourceY < source.height
        ) {
          id = source.ids[sourceY * source.width + sourceX];
          alpha = source.alpha[sourceY * source.width + sourceX];
        }

        if (copy) {
          ids[index] = id;
          alphas[index] = alpha;
          painted++;

          continue;
        }

        painted += blend(ids, alphas, index, id, alpha);
      }
    }

    canvas.counters.paintedPixels += painted;
  }

  #paintRect(rect: Rect, id: number, alpha: number): void {
    if (this.#state.globalCompositeOperation === 'copy') {
      throw new Error('only drawImage is modelled with copy');
    }

    const [firstX, lastX, firstY, lastY] = this.#bounds(rect),
      canvas = this.#canvas,
      stride = canvas.width;

    let painted = 0;

    for (let py = firstY; py < lastY; py++) {
      for (let px = firstX; px < lastX; px++) {
        painted += blend(canvas.ids, canvas.alpha, py * stride + px, id, alpha);
      }
    }

    canvas.counters.paintedPixels += painted;
  }

  // The columns and rows, first to last exclusive, of the pixels whose centres are in `rect`, the clip and the canvas.
  #bounds(rect: Rect): [number, number, number, number] {
    const clip = this.#state.clip;

    let left = Math.max(0, rect.x),
      top = Math.max(0, rect.y),
      right = Math.min(this.#canvas.width, rect.x + rect.width),
      bottom = Math.min(this.#canvas.height, rect.y + rect.height);

    if (clip !== null) {
      left = Math.max(left, clip.x);
      top = Math.max(top, clip.y);
      right = Math.min(right, clip.x + clip.width);
      bottom = Math.min(bottom, clip.y + clip.height);
    }

    // The first pixel whose centre is at or past `left`, and the first whose centre is at or past `right`.
    const firstX = Math.ceil(left - 0.5),
      lastX = Math.max(firstX, Math.ceil(right - 0.5)),
      firstY = Math.ceil(top - 0.5),
      lastY = Math.max(firstY, Math.ceil(bottom - 0.5));

    return [firstX, lastX, firstY, lastY];
  }

  #source(image: unknown): Source {
    if (image instanceof SoftwareCanvas) {
      // A copy, so a canvas drawn onto itself reads what it held before the draw.
      return image.snapshot();
    }

    if (image instanceof FakeImage) {
      const { path, naturalWidth: width, naturalHeight: height } = image,
        key = `${path} ${width}x${height}`;

      if (!sprites.has(key)) {
        const hash = stringHash(path),
          ids = new Uint32Array(width * height),
          alpha = new Uint8Array(width * height);

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const opacity = Math.round(
              spriteMask(path, x, y, width, height) * 255
            );

            ids[y * width + x] = opacity === 0 ? 0 : mix(hash, x, y);
            alpha[y * width + x] = opacity;
          }
        }

        sprites.set(key, { ids, alpha });
      }

      return { width, height, ...sprites.get(key)! };
    }

    throw new Error(`cannot draw ${String(image)}`);
  }

  #count(method: string): void {
    const calls = this.#canvas.counters.calls;

    calls[method] = (calls[method] ?? 0) + 1;
  }
}

/** A software canvas `width` by `height`, typed as the canvas the layers take. */
export const softwareCanvas = (
  width: number = 0,
  height: number = 0
): SoftwareCanvas & HTMLCanvasElement =>
  new SoftwareCanvas(width, height) as SoftwareCanvas & HTMLCanvasElement;

/**
 * Makes `s('<canvas ...>')`, which is how a layer and the coast squares get their canvases, give a software canvas of
 *  the size in its attributes.
 */
export const useSoftwareCanvases = (): void => {
  Object.assign((globalThis as any).document, {
    createElement: () => {
      let html = '';

      return {
        set innerHTML(value: string) {
          html = value;
        },
        get firstElementChild() {
          const size = (attribute: string): number =>
            Number(html.match(new RegExp(`${attribute}="(\\d+)"`))?.[1] ?? 0);

          return new SoftwareCanvas(size('width'), size('height'));
        },
      };
    },
  });
};
