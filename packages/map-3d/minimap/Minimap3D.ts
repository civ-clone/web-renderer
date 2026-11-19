// The 3D map's minimap (docs/3d-renderer-plan.md 1.5): an overview of its own, as the 2D map's is its own, on the
//  page's minimap canvas. It's drawn on the ground, not on the grid: each square is its outline (`GroundLayout`) in the
//  colour the 3D map gives its terrain, so one overview serves every grid. Over it:
//  - each city, and each square with units, a dot in its owner's colour;
//  - the unit awaiting orders, a white dot;
//  - the patch of ground the camera sees, four-sided, as the camera's turned and tilted, at every copy of the world the
//    overview shows.
// A click on it moves the camera there.
//
// The overview is drawn again only when squares change, and the camera's patch over it every frame the camera moves.

import { GroundLayout } from '../layouts/GroundLayout';
import { coloursOf, unitOnTop } from '../markers/markerFor';
import { terrainEntry } from '@civ-clone/ui-models-builtin/terrain';
import { Coordinate, Tile } from '@civ-clone/ui-protocol/types';

/** What the minimap reads of the world. */
export type MinimapWorld = {
  width(): number;
  height(): number;
  get(x: number, y: number): Tile;
};

// How many of the overview's px a world unit is: the canvas is scaled to its box by the page's style.
const PX_PER_UNIT = 4;

export class Minimap3D {
  #canvas: HTMLCanvasElement;
  #context: CanvasRenderingContext2D | null;
  #layout: GroundLayout;
  #world: MinimapWorld;
  // How far the ground runs across and down.
  #across: number;
  #down: number;
  // How far down the ground repeats, where the world wraps over the poles.
  #periodV: number | null;
  // The overview without the camera's patch, drawn when squares change.
  #overview: HTMLCanvasElement;
  // Where each square is drawn: where it is, a world to the left, and a world up where the world wraps over the poles.
  #copies: [number, number][];
  #onPick: (u: number, v: number) => void;
  #click = (event: MouseEvent): void => {
    const box = this.#canvas.getBoundingClientRect(),
      x = box.width > 0 ? (event.clientX - box.left) / box.width : 0,
      y = box.height > 0 ? (event.clientY - box.top) / box.height : 0;

    this.#onPick(x * this.#across, y * this.#down);
  };

  constructor(
    canvas: HTMLCanvasElement,
    layout: GroundLayout,
    world: MinimapWorld,
    extentV: number,
    onPick: (u: number, v: number) => void
  ) {
    this.#canvas = canvas;
    this.#layout = layout;
    this.#world = world;
    this.#across = layout.period().u;
    this.#down = extentV;
    this.#onPick = onPick;
    this.#overview = document.createElement('canvas');

    const { v: periodV } = layout.period();

    this.#periodV = periodV;

    this.#copies = [
      [0, 0],
      [-this.#across, 0],
      ...(periodV === null
        ? []
        : ([
            [0, -periodV],
            [-this.#across, -periodV],
          ] as [number, number][])),
    ];

    const width = Math.max(1, Math.round(this.#across * PX_PER_UNIT)),
      height = Math.max(1, Math.round(this.#down * PX_PER_UNIT));

    [canvas, this.#overview].forEach((each) => {
      each.width = width;
      each.height = height;
    });

    this.#context = canvas.getContext('2d');
    canvas.addEventListener('click', this.#click);
  }

  dispose(): void {
    this.#canvas.removeEventListener('click', this.#click);
  }

  // A point on the ground, on the overview.
  #px(u: number, v: number): [number, number] {
    return [u * PX_PER_UNIT, v * PX_PER_UNIT];
  }

  // The outline of the square at (`x`, `y`), on the overview, `across` and `down` from where it is.
  #outline(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    across = 0,
    down = 0
  ): void {
    context.beginPath();
    this.#layout.outline(x, y).forEach(([u, v], index) => {
      const [px, py] = this.#px(u + across, v + down);

      if (index === 0) {
        context.moveTo(px, py);
      } else {
        context.lineTo(px, py);
      }
    });
    context.closePath();
  }

  /** Draws the overview again from the world: every square's terrain, and its city and units. */
  redraw(): void {
    const context = this.#overview.getContext('2d');

    if (context === null) {
      return;
    }

    const width = this.#world.width(),
      height = this.#world.height(),
      dots: [number, number, string, number][] = [];

    context.fillStyle = '#000000';
    context.fillRect(0, 0, this.#overview.width, this.#overview.height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tile = this.#world.get(x, y),
          name = tile.terrain?._ ?? 'Unknown';

        if (name === 'Unknown') {
          continue;
        }

        context.fillStyle = terrainEntry(name).colour;
        // The squares at the right edge spill past it, and at the bottom where the world wraps over the poles: they're
        //  drawn again a world to the left, and up, where the overview shows the rest of them.
        this.#copies.forEach(([across, down]) => {
          this.#outline(context, x, y, across, down);
          context.fill();
        });

        const [u, v] = this.#layout.centre(x, y);

        if (tile.city) {
          dots.push([u, v, coloursOf(tile.city.player)[0], 2.2]);
        } else if ((tile.units ?? []).length > 0) {
          const top = unitOnTop(tile.units, null);

          if (top !== null) {
            dots.push([u, v, coloursOf(top.player)[0], 1.4]);
          }
        }
      }
    }

    // Each at every copy that could show on the overview, so one at an edge shows on the far side too.
    dots.forEach(([u, v, colour, size]) =>
      this.#everywhere(u, v).forEach(([px, py]) => {
        context.fillStyle = '#000000';
        context.fillRect(
          px - size - 0.5,
          py - size - 0.5,
          size * 2 + 1,
          size * 2 + 1
        );
        context.fillStyle = colour;
        context.fillRect(px - size, py - size, size * 2, size * 2);
      })
    );
  }

  // A point on the ground on the overview, at every copy that could show on it: where it is, a world either side, and a
  //  world up and down where the world wraps over the poles.
  #everywhere(u: number, v: number): [number, number][] {
    const downs =
      this.#periodV === null ? [0] : [-this.#periodV, 0, this.#periodV];

    return downs.flatMap((down) =>
      [-this.#across, 0, this.#across].map((across) =>
        this.#px(u + across, v + down)
      )
    );
  }

  /**
   * Shows the overview with `patch`, the ground the camera sees (its corners, in order, on the ground), and the unit
   *  awaiting orders at `active`, over it.
   */
  show(
    patch: readonly (readonly [number, number])[] | null,
    active: Coordinate | null
  ): void {
    const context = this.#context;

    if (context === null) {
      return;
    }

    context.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
    context.drawImage(this.#overview, 0, 0);

    if (active !== null) {
      const [u, v] = this.#layout.centre(active.x, active.y);

      context.fillStyle = '#ffffff';
      this.#everywhere(u, v).forEach(([px, py]) =>
        context.fillRect(px - 2, py - 2, 4, 4)
      );
    }

    if (patch === null || patch.length < 3) {
      return;
    }

    context.strokeStyle = '#ffffff';
    context.lineWidth = 1;

    // Taken into the world's period, and drawn at each copy that could show on the overview: across, and down too where
    //  the world wraps over the poles.
    const periodV = this.#periodV,
      left = Math.min(...patch.map(([u]) => u)),
      top = Math.min(...patch.map(([, v]) => v)),
      shift = -this.#across * Math.floor(left / this.#across),
      shiftV = periodV === null ? 0 : -periodV * Math.floor(top / periodV),
      downs = periodV === null ? [0] : [-periodV, 0, periodV];

    downs.forEach((down) =>
      [-this.#across, 0, this.#across].forEach((copy) => {
        context.beginPath();
        patch.forEach(([u, v], index) => {
          const [px, py] = this.#px(u + shift + copy, v + shiftV + down);

          if (index === 0) {
            context.moveTo(px, py);
          } else {
            context.lineTo(px, py);
          }
        });
        context.closePath();
        context.stroke();
      })
    );
  }
}

export default Minimap3D;
