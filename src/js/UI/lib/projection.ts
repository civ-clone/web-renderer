import { Rect } from './viewport';

export type Size = {
  width: number;
  height: number;
};

/** How far, in px, a sprite may reach past its tile's sprite box on each side. */
export type Reach = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

/** One place a tile is drawn: the tile, and the top left of its sprite box on the canvas, in px. */
export type Placement = {
  x: number;
  y: number;
  px: number;
  py: number;
};

/** The first and last (exclusive) columns and rows, not wrapped, that reach a rectangle. */
export type TileSpan = {
  columns: [number, number];
  rows: [number, number];
};

const noReach: Reach = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

/**
 * Where tiles go in pixels on the map, and which tile a pixel is on (#90).
 *
 * The map was a grid of squares in every sum that placed a tile: `x * size` one way and `floor(px / size)` the other.
 * Isometric and hex maps place tiles differently, with a different footprint and a different wrap, so that maths
 * lives here and the layers and the portal ask for it (#86).
 *
 * Pixels are world pixels: the top left of tile 0,0 is 0,0, before the portal's viewport is taken off.
 */
export interface Projection {
  /** The top left of the tile's sprite box. */
  tileToPixel(x: number, y: number): [number, number];

  /**
   * The tile a pixel falls on. Not wrapped: a pixel a world's width to the right gives a column a world's width
   * along, and the caller wraps it, as `World.get` does.
   */
  pixelToTile(px: number, py: number): [number, number];

  /** The size of a tile's sprite box. */
  footprint(): Size;

  /** The size of the whole world. */
  worldSize(): Size;

  /**
   * How far apart, in px, the copies of the world are: across always, and down only when the world wraps over the
   * poles.
   */
  wrapPeriod(): { x: number; y: number | null };

  /**
   * Whether a tile's sprite box overlaps its neighbours' (a staggered or hex grid), so a tile can't be cleared and
   *  redrawn on its own: whatever of its neighbours reaches into its box has to be drawn again too, in order (#91).
   */
  overlapsNeighbours(): boolean;

  /** How far past its sprite box the projection's own sprites reach, as a tall mountain reaches into the row above. */
  reach(): Reach;

  /**
   * Back to front: by screen y, then screen x, then the tile's own co-ordinates. A total order on placements rather
   *  than tiles, because a tile on the seam is drawn twice in two different places, and each copy has its own
   *  neighbours to go in front of or behind.
   */
  compareDrawOrder(a: Placement, b: Placement): number;

  /**
   * The columns and rows, not wrapped, whose sprite boxes grown by `overhang` reach `rect`, a rectangle in world px.
   *  The caller wraps them, as `wrapIndices` does.
   */
  tileSpan(rect: Rect, overhang: number): TileSpan;
}

/** How many tiles a world is across and down, as `World` says. */
export interface WorldDimensions {
  width(): number;
  height(): number;
}

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

/** The smallest rectangle, in world pixels, that holds the sprite box of every one of `tiles`. */
export const tileBounds = (
  projection: Projection,
  tiles: { x: number; y: number }[]
): Rect => {
  const { width, height } = projection.footprint(),
    corners = tiles.map(({ x, y }) => projection.tileToPixel(x, y)),
    left = Math.min(...corners.map(([px]) => px)),
    top = Math.min(...corners.map(([, py]) => py));

  return {
    x: left,
    y: top,
    width: Math.max(...corners.map(([px]) => px + width)) - left,
    height: Math.max(...corners.map(([, py]) => py + height)) - top,
  };
};

export default SquareProjection;
