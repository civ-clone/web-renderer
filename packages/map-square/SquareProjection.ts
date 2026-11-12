import {
  Placement,
  Projection,
  Reach,
  Size,
  TileSpan,
  WorldDimensions,
  noReach,
} from '@civ-clone/ui-map/lib/projection';
import { Rect } from '@civ-clone/ui-map/lib/viewport';

// The square grid's own code (#825): the map draws every grid through a `Projection`, and only what is true of squares
//  alone lives here. Hexagonal and isometric grids get folders of their own beside this one (#94, #97).

/**
 * Square tiles, `size` px each.
 *
 * The world's dimensions are asked for only when they are needed, as they were before there was a projection: a layer
 * drawn on its own in a test can have a world with none, and only the sizes that need them would notice.
 */
export class SquareProjection implements Projection {
  // The answers never change for a projection's life (the map builds a new
  // one when the scale or the wrap changes), and `placements` asks for them
  // for every tile it draws, so each is made once rather than per call.
  #footprint: Size;
  #size: number;
  #step: { x: number; y: number };
  #world: WorldDimensions;
  #worldSize: Size | null = null;
  #wrapPeriod: { x: number; y: number | null } | null = null;
  #wrapVertical: boolean;

  constructor(
    size: number,
    world: WorldDimensions,
    wrapVertical: boolean = true
  ) {
    this.#size = size;
    this.#world = world;
    this.#wrapVertical = wrapVertical;
    this.#footprint = { width: size, height: size };
    this.#step = { x: size, y: size };
  }

  compareDrawOrder(a: Placement, b: Placement): number {
    return a.py - b.py || a.px - b.px || a.y - b.y || a.x - b.x;
  }

  footprint(): Size {
    return this.#footprint;
  }

  // Each square stays in its own box, so a tile can be cleared and redrawn on its own, in any order.
  overlapsNeighbours(): boolean {
    return false;
  }

  pixelToTile(px: number, py: number): [number, number] {
    return [Math.floor(px / this.#size), Math.floor(py / this.#size)];
  }

  reach(): Reach {
    return noReach;
  }

  tileSpan({ x, y, width, height }: Rect, overhang: number): TileSpan {
    const size = this.#size,
      span = (start: number, length: number): [number, number] =>
        size <= 0
          ? [0, 0]
          : [
              Math.floor((start - overhang) / size),
              Math.ceil((start + length + overhang) / size),
            ];

    return { columns: span(x, width), rows: span(y, height) };
  }

  // Each square is the next one's neighbour, a whole tile along and down.
  tileStep(): { x: number; y: number } {
    return this.#step;
  }

  tileToPixel(x: number, y: number): [number, number] {
    return [x * this.#size, y * this.#size];
  }

  worldSize(): Size {
    if (!this.#worldSize) {
      this.#worldSize = {
        width: this.#world.width() * this.#size,
        height: this.#world.height() * this.#size,
      };
    }

    return this.#worldSize;
  }

  wrapPeriod(): { x: number; y: number | null } {
    if (!this.#wrapPeriod) {
      this.#wrapPeriod = {
        x: this.#world.width() * this.#size,
        y: this.#wrapVertical ? this.#world.height() * this.#size : null,
      };
    }

    return this.#wrapPeriod;
  }
}

export default SquareProjection;
