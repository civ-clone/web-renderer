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

// The hexagonal grid's own code (#94): pointy-topped hexes in rows, every odd row shifted half a hex right, as the
//  engine's `HexOddRTopology` stores them.

// A hex in its box, as fractions of the box across and down: its top point, then clockwise as drawn.
const hexagon: readonly (readonly [number, number])[] = Object.freeze([
  Object.freeze([0.5, 0] as const),
  Object.freeze([1, 0.25] as const),
  Object.freeze([1, 0.75] as const),
  Object.freeze([0.5, 1] as const),
  Object.freeze([0, 0.75] as const),
  Object.freeze([0, 0.25] as const),
]);

/**
 * Pointy-topped hexes `width` × `height` px, in rows three quarters of a hex apart, every odd row shifted half a hex
 *  across:
 *
 * ```
 *   /\/\/\/\
 *  | | | | |        row 0 at y 0, row 1 at y 3·height/4 and x width/2, row 2 at y 3·height/2, …
 *   \/\/\/\/\
 *    | | | | |
 *    \/\/\/\/
 * ```
 *
 * A tile's sprite box is the hex's bounding box, `width` × `height`, with its top left at
 *  `(c·width + (r & 1)·width/2, r·3·height/4)`. Its top and bottom quarters are zigzags: the corner triangles either
 *  side of its top and bottom points are its four diagonal neighbours' (`ne nw` above, `se sw` below), so a pixel
 *  belongs to the hex it is in, not the box. Its middle half is its own, from side to side.
 *
 * The world wraps across every `W·width` px, and down every `H·3·height/4` px when it wraps over the poles, which a
 *  staggered world can only do with an even number of rows (as the topology says): row 0 has to follow an odd row.
 *
 * `width` is even and `height` a multiple of 4, so every step, shift and point is a whole pixel (`hexProjection` refuses
 *  any other size). A regular hexagon is `2/√3` times as tall as it is wide, which no whole size is, so the tileset
 *  picks the nearest one it likes, 32 × 36 say; the grid only needs the hex to be symmetrical with corners a quarter of
 *  the way down.
 */
export class HexProjection implements Projection {
  #footprint: Size;
  #height: number;
  #reach: Reach;
  #width: number;
  #world: WorldDimensions;
  #worldSize: Size | null = null;
  #wrapPeriod: { x: number; y: number | null } | null = null;
  #wrapVertical: boolean;

  constructor(
    { width, height }: Size,
    world: WorldDimensions,
    wrapVertical: boolean = true,
    reach: Reach = noReach
  ) {
    this.#width = width;
    this.#height = height;
    this.#world = world;
    this.#wrapVertical = wrapVertical;
    this.#reach = Object.freeze({ ...reach });
    this.#footprint = { width, height };
  }

  // Top to bottom, then left to right: a row's hexes only touch at their sides, and each row overlaps the one above by
  //  its zigzag, so the one below goes in front, as a sprite reaching up out of its tile should.
  compareDrawOrder(a: Placement, b: Placement): number {
    return a.py - b.py || a.px - b.px || a.y - b.y || a.x - b.x;
  }

  footprint(): Size {
    return this.#footprint;
  }

  // The hexagon: points at the middle of the box's top and bottom, corners a quarter of the way down each side.
  outline(): readonly (readonly [number, number])[] {
    return hexagon;
  }

  // Every box overlaps its four diagonal neighbours' at its zigzags.
  overlapsNeighbours(): boolean {
    return true;
  }

  /**
   * The hex the pixel's centre is in.
   *
   * Rows are `3q` px apart (`q` a quarter of the hex's height), and a hex is `4q` tall, so each row's band of `3q` px
   *  starts with `q` px of zigzag, which it shares with the row above, and then `2q` px of its own. In the band's own
   *  part, the pixel's column is simply which box of the row it is in. In the zigzag it is either under one of this
   *  row's top edges, so this row's, or above it, so the row above's: a top edge climbs from its corner, `q` px down
   *  at the box's side, to its point, `0` at the box's middle, so the pixel is this row's when it is at least
   *  `q·d/(width/2)` into the band, `d` being how far it is across from the box's middle.
   *
   * Worked in whole numbers, in half pixels, so that a pixel exactly on an edge always goes the same way and every
   *  pixel is in exactly one hex.
   */
  pixelToTile(px: number, py: number): [number, number] {
    const width = this.#width,
      // In half pixels from here on: a pixel's centre, a quarter hex, a row step, a box and half a box.
      x = 2 * px + 1,
      y = 2 * py + 1,
      quarter = this.#height / 2,
      rowStep = 3 * quarter,
      box = 2 * width,
      band = Math.floor(y / rowStep),
      into = y - band * rowStep,
      // Which box of `row` the pixel is in: an odd row starts half a box (`width` half pixels) across.
      column = (row: number): number =>
        Math.floor((x - (row & 1) * width) / box);

    if (into >= quarter) {
      return [column(band), band];
    }

    const here = column(band),
      middle = (band & 1) * width + here * box + width,
      across = x < middle ? middle - x : x - middle;

    // Under the top edge: `into / quarter >= across / width`, multiplied through.
    if (into * width >= quarter * across) {
      return [here, band];
    }

    return [column(band - 1), band - 1];
  }

  reach(): Reach {
    return this.#reach;
  }

  tileSpan({ x, y, width, height }: Rect, overhang: number): TileSpan {
    const tileWidth = this.#width,
      tileHeight = this.#height,
      rowStep = (tileHeight * 3) / 4;

    if (tileWidth <= 0 || tileHeight <= 0) {
      return { columns: [0, 0], rows: [0, 0] };
    }

    return {
      // An odd row starts half a tile across, so a column one further left still reaches in.
      columns: [
        Math.floor((x - overhang - tileWidth / 2) / tileWidth),
        Math.ceil((x + width + overhang) / tileWidth),
      ],
      // A row's boxes are taller than its step, so the row above still reaches down into the rectangle.
      rows: [
        Math.floor((y - overhang - tileHeight) / rowStep) + 1,
        Math.ceil((y + height + overhang) / rowStep),
      ],
    };
  }

  // A column is a hex along, and a row three quarters of a hex down.
  tileStep(): { x: number; y: number } {
    return { x: this.#width, y: (this.#height * 3) / 4 };
  }

  tileToPixel(x: number, y: number): [number, number] {
    return [
      x * this.#width + (y & 1) * (this.#width / 2),
      (y * this.#height * 3) / 4,
    ];
  }

  // The odd rows' last hexes reach half a tile past the even rows', and the last row a quarter of a hex below its step.
  worldSize(): Size {
    if (!this.#worldSize) {
      this.#worldSize = {
        width: this.#world.width() * this.#width + this.#width / 2,
        height: ((3 * this.#world.height() + 1) * this.#height) / 4,
      };
    }

    return this.#worldSize;
  }

  wrapPeriod(): { x: number; y: number | null } {
    if (!this.#wrapPeriod) {
      const rows = this.#world.height();

      this.#wrapPeriod = {
        x: this.#world.width() * this.#width,
        // An odd number of rows can't wrap: the row below the last would have its parity, not row 0's.
        y:
          this.#wrapVertical && rows % 2 === 0
            ? (rows * this.#height * 3) / 4
            : null,
      };
    }

    return this.#wrapPeriod;
  }
}

export default HexProjection;
