import { Rect } from '../../lib/viewport';

// How the unit awaiting orders is marked on the map (#753): Civ1's blink, a ring round its square that pulses softly,
//  or both. The player's choice in Options (`unitMarker`), or by default the theme's (`--ui-unit-marker`): the Civ1 set
//  blinks, slate rings.

export type UnitMarkerMode = 'blink' | 'ring' | 'both';

// What Options offers: the theme's own, or one of the three for every theme.
export const UNIT_MARKER_CHOICES = ['theme', 'blink', 'ring', 'both'] as const;

const isMode = (value: unknown): value is UnitMarkerMode =>
  value === 'blink' || value === 'ring' || value === 'both';

/** The mode for `choice` (the `unitMarker` option): itself, or for `theme` (or anything else) the theme's, else blink. */
export const unitMarkerMode = (
  choice: unknown,
  // Where the page can't say (a document with no styles), no theme: the blink.
  themed: () => string = () =>
    typeof getComputedStyle === 'function'
      ? getComputedStyle(document.documentElement)
          .getPropertyValue('--ui-unit-marker')
          .trim()
      : ''
): UnitMarkerMode => {
  if (isMode(choice)) {
    return choice;
  }

  const fromTheme = themed();

  return isMode(fromTheme) ? fromTheme : 'blink';
};

/**
 * The ring: an element over the map's canvas round each square the unit is drawn on (more than one where the world
 *  wraps into view twice), placed from the canvas's pixels to the page's. Its pulse is the stylesheet's, so the map is
 *  never drawn again for it. Placed after the canvas in `#map`, so whatever floats over the map later in the page
 *  (the sidebar, the orbs) is drawn over it.
 */
export class UnitMarker {
  #canvas: HTMLCanvasElement;
  #element: HTMLElement;
  // What was placed last, so the same squares don't touch the page again.
  #placed: string = '';

  constructor(canvas: HTMLCanvasElement) {
    this.#canvas = canvas;
    this.#element = canvas.ownerDocument.createElement('div');
    this.#element.className = 'ui-unit-markers';
    this.#element.setAttribute('aria-hidden', 'true');
    this.#element.hidden = true;

    canvas.after(this.#element);
  }

  element(): HTMLElement {
    return this.#element;
  }

  /** Rings `squares` (in the canvas's pixels), or none when `shown` is false. */
  place(squares: Rect[], shown: boolean): void {
    const canvas = this.#canvas,
      // The canvas is drawn at its box's size, but may be stretched to it: its pixels to the page's.
      scaleX =
        canvas.width > 0
          ? (canvas.clientWidth || canvas.width) / canvas.width
          : 1,
      scaleY =
        canvas.height > 0
          ? (canvas.clientHeight || canvas.height) / canvas.height
          : 1,
      boxes = shown
        ? squares.map(({ x, y, width, height }) => ({
            left: (canvas.offsetLeft || 0) + x * scaleX,
            top: (canvas.offsetTop || 0) + y * scaleY,
            width: width * scaleX,
            height: height * scaleY,
          }))
        : [],
      placed = JSON.stringify(boxes);

    if (placed === this.#placed) {
      return;
    }

    this.#placed = placed;
    this.#element.hidden = boxes.length === 0;

    const rings = Array.from(this.#element.children) as HTMLElement[];

    // One ring a square: the ones there moved, the rest made or taken away. A ring kept keeps its pulse's phase.
    boxes.forEach(({ left, top, width, height }, index) => {
      const ring =
        rings[index] ??
        this.#element.appendChild(canvas.ownerDocument.createElement('div'));

      ring.className = 'ui-unit-marker';
      ring.style.left = `${left}px`;
      ring.style.top = `${top}px`;
      ring.style.width = `${width}px`;
      ring.style.height = `${height}px`;
    });

    rings.slice(boxes.length).forEach((ring) => ring.remove());
  }

  dispose(): void {
    this.#element.remove();
  }
}

export default UnitMarker;
