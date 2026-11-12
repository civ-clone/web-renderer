import {
  Placement,
  Projection,
  Size,
  TileSpan,
  WorldDimensions,
  noReach,
  Reach,
} from '@civ-clone/ui-map/lib/projection';
import { Rect } from '@civ-clone/ui-map/lib/viewport';

/**
 * The isometric overview's tiles: each one a flat `width` × `height` brick where the map's diamond is, in the same
 * staggered rows. `width` is a diamond's width and `height` its row step, so the overview has the map's shape at a few
 * pixels a tile:
 *
 * ```
 *  [][][][]       row 0 at y 0, row 1 at y height and x width/2, row 2 at y 2·height, …
 *   [][][][]
 *  [][][][]
 * ```
 *
 * At the overview's sizes a diamond would be a smudge two or four pixels across (a 4 × 2 diamond is a 2 × 2 square,
 * its corners its neighbours'), so the overview draws the part of the diamond that matters, its middle, as a brick.
 * Bricks fill the plane exactly, one per tile, so they never overlap and each is drawn on its own, and a pixel's brick
 * is the tile under it, which is what the minimap needs of a click. Each brick is the middle band of its diamond's box,
 * so a brick's centre is its diamond's.
 */
export class OverviewProjection implements Projection {
  #footprint: Size;
  #height: number;
  #width: number;
  #world: WorldDimensions;
  #wrapVertical: boolean;

  constructor(
    { width, height }: Size,
    world: WorldDimensions,
    wrapVertical: boolean = true
  ) {
    this.#width = width;
    this.#height = height;
    this.#world = world;
    this.#wrapVertical = wrapVertical;
    this.#footprint = { width, height };
  }

  compareDrawOrder(a: Placement, b: Placement): number {
    return a.py - b.py || a.px - b.px || a.y - b.y || a.x - b.x;
  }

  footprint(): Size {
    return this.#footprint;
  }

  overlapsNeighbours(): boolean {
    return false;
  }

  pixelToTile(px: number, py: number): [number, number] {
    const row = Math.floor(py / this.#height);

    return [
      Math.floor((px - (row & 1) * (this.#width / 2)) / this.#width),
      row,
    ];
  }

  reach(): Reach {
    return noReach;
  }

  tileSpan({ x, y, width, height }: Rect, overhang: number): TileSpan {
    const tileWidth = this.#width,
      tileHeight = this.#height;

    if (tileWidth <= 0 || tileHeight <= 0) {
      return { columns: [0, 0], rows: [0, 0] };
    }

    return {
      // An odd row starts half a brick across, so a column one further left still reaches in.
      columns: [
        Math.floor((x - overhang - tileWidth / 2) / tileWidth),
        Math.ceil((x + width + overhang) / tileWidth),
      ],
      rows: [
        Math.floor((y - overhang) / tileHeight),
        Math.ceil((y + height + overhang) / tileHeight),
      ],
    };
  }

  tileStep(): { x: number; y: number } {
    return { x: this.#width, y: this.#height };
  }

  tileToPixel(x: number, y: number): [number, number] {
    return [x * this.#width + (y & 1) * (this.#width / 2), y * this.#height];
  }

  worldSize(): Size {
    return {
      width: this.#world.width() * this.#width + this.#width / 2,
      height: this.#world.height() * this.#height,
    };
  }

  wrapPeriod(): { x: number; y: number | null } {
    const rows = this.#world.height();

    return {
      x: this.#world.width() * this.#width,
      y: this.#wrapVertical && rows % 2 === 0 ? rows * this.#height : null,
    };
  }
}

export default OverviewProjection;
