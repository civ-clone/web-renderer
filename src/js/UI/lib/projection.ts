import { Rect } from './viewport';

export type Size = {
  width: number;
  height: number;
};

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

  footprint(): Size {
    return this.#footprint;
  }

  pixelToTile(px: number, py: number): [number, number] {
    return [Math.floor(px / this.#size), Math.floor(py / this.#size)];
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
