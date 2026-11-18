import { iconCanvasSize } from './unitActionIcon';

type Draw = (canvas: HTMLCanvasElement) => void;
type Size = (canvas: HTMLCanvasElement) => number;

/**
 * Canvases of unit action icons, each drawn for the size it's shown at (#352), and drawn again when that changes (#358):
 *  the browser zoomed, the window moved to a screen of another pixel ratio, or the button resized. Left alone, the
 *  browser would stretch the old drawing, and the marks on it would blur.
 */
export class ScaledCanvases {
  #drawn = new Map<HTMLCanvasElement, Draw>();
  #observer: ResizeObserver | null =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver((): void => this.#redraw())
      : null;

  // How many pixels across a canvas is drawn: the order icons' own (`OrderIcons.canvasSize`), as whoever draws them
  //  says.
  #size: Size;

  constructor(size: Size = iconCanvasSize) {
    this.#size = size;
    this.#watchRatio();
  }

  /** Draws `canvas` now, and again whenever it's shown at another size. */
  add(canvas: HTMLCanvasElement, draw: Draw): void {
    this.#drawn.set(canvas, draw);
    draw(canvas);
    this.#observer?.observe(canvas);
  }

  /** Forgets them all, as the buttons they're on are replaced. */
  clear(): void {
    this.#observer?.disconnect();
    this.#drawn.clear();
  }

  // Only those whose drawing no longer fits, by the size it's drawn at (`#size`): drawing one doesn't change what
  //  it's shown at, so this settles.
  #redraw(): void {
    this.#drawn.forEach((draw, canvas) => {
      if (canvas.width !== this.#size(canvas)) {
        draw(canvas);
      }
    });
  }

  // A media query for the ratio as it is, which stops matching once it changes: the only event there is for it, so
  //  each is asked for in turn.
  #watchRatio(): void {
    globalThis
      .matchMedia?.(`(resolution: ${globalThis.devicePixelRatio || 1}dppx)`)
      ?.addEventListener(
        'change',
        (): void => {
          this.#redraw();
          this.#watchRatio();
        },
        { once: true }
      );
  }
}

export default ScaledCanvases;
