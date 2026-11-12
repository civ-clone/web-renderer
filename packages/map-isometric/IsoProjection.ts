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

// The staggered isometric grid's own code (#97): diamonds in rows, every odd row shifted half a tile right, as the
//  engine's `StaggeredIsoTopology` stores them and Civ2 draws them.

// A tile's diamond in its box, as fractions of the box across and down: the middles of its four sides.
const diamond: readonly (readonly [number, number])[] = Object.freeze([
  Object.freeze([0.5, 0] as const),
  Object.freeze([1, 0.5] as const),
  Object.freeze([0.5, 1] as const),
  Object.freeze([0, 0.5] as const),
]);

/**
 * Diamond tiles `width` × `height` px, in rows half a tile apart, every odd row shifted half a tile across:
 *
 * ```
 *  /\/\/\/\
 *  \/\/\/\/\     row 0 at y 0, row 1 at y height/2 and x width/2, row 2 at y height, …
 *  /\/\/\/\/
 * ```
 *
 * A tile's sprite box is the diamond's bounding box, `width` × `height`, with its top left at
 * `(c·width + (r & 1)·width/2, r·height/2)`. The boxes overlap: each box's four corner triangles are its four edge
 * neighbours' (`ne se sw nw`), so a pixel belongs to the diamond it is in, not the box.
 *
 * The world wraps across every `W·width` px, and down every `H·height/2` px when it wraps over the poles, which a
 * staggered world can only do with an even number of rows (as the topology says): row 0 has to follow an odd row.
 *
 * `width` and `height` are whole and even, so every step and shift is a whole pixel (`isoProjection` refuses any other
 *  size). Sprites reach `reach` past their box, as Civ2's 64×48 units and cities reach 16px above a 64×32 tile.
 */
export class IsoProjection implements Projection {
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

  // Top to bottom, then left to right: a row's diamonds only touch at their corners, and each row overlaps the one
  //  above, so the one below goes in front, as a sprite reaching up out of its tile should.
  compareDrawOrder(a: Placement, b: Placement): number {
    return a.py - b.py || a.px - b.px || a.y - b.y || a.x - b.x;
  }

  footprint(): Size {
    return this.#footprint;
  }

  // The diamond: the middles of the box's four sides. A pixel whose centre is inside it is this tile's.
  outline(): readonly (readonly [number, number])[] {
    return diamond;
  }

  // Every box overlaps its four edge neighbours' at the corners.
  overlapsNeighbours(): boolean {
    return true;
  }

  /**
   * The diamond the pixel's centre is in.
   *
   * In half-tile units, a tile's centre is at `(d + 1, r + 1)` with `d = 2c + (r & 1)`, and its diamond is everything
   *  less than one unit away by `|dx| + |dy|`. Turned through 45° that is the square grid: `a = (d + r) / 2` and
   *  `b = (r - d) / 2` are whole at every centre, and a diamond is every point within half a unit of one on both. So
   *  rounding the pixel's `a` and `b` finds its tile, and `r = a + b`, `d = a - b` turn it back.
   *
   * Worked in whole numbers, multiplied through by `2·width·height`, so that a pixel exactly on an edge (which a 2:1
   *  tile never has, but a square one does) always goes the same way and every pixel is in exactly one tile.
   */
  pixelToTile(px: number, py: number): [number, number] {
    const width = this.#width,
      height = this.#height,
      across = (2 * px + 1) * height,
      down = (2 * py + 1) * width,
      area = width * height,
      unit = 2 * area,
      a = Math.floor((across + down - area) / unit),
      b = Math.floor((down - across + area) / unit),
      row = a + b;

    // `a - b` has the row's parity, so halving it floors to the column whichever row it is, negative ones included.
    return [Math.floor((a - b) / 2), row];
  }

  reach(): Reach {
    return this.#reach;
  }

  tileSpan({ x, y, width, height }: Rect, overhang: number): TileSpan {
    const tileWidth = this.#width,
      tileHeight = this.#height,
      rowStep = tileHeight / 2;

    if (tileWidth <= 0 || tileHeight <= 0) {
      return { columns: [0, 0], rows: [0, 0] };
    }

    return {
      // An odd row starts half a tile across, so a column one further left still reaches in.
      columns: [
        Math.floor((x - overhang - tileWidth / 2) / tileWidth),
        Math.ceil((x + width + overhang) / tileWidth),
      ],
      // A row's boxes are two rows high, so the row above still reaches down into the rectangle.
      rows: [
        Math.floor((y - overhang - tileHeight) / rowStep) + 1,
        Math.ceil((y + height + overhang) / rowStep),
      ],
    };
  }

  // A column is a diamond along, and a row half a diamond down: twice as many rows fit a canvas as boxes would.
  tileStep(): { x: number; y: number } {
    return { x: this.#width, y: this.#height / 2 };
  }

  tileToPixel(x: number, y: number): [number, number] {
    return [
      x * this.#width + (y & 1) * (this.#width / 2),
      y * (this.#height / 2),
    ];
  }

  // The odd rows' last diamonds reach half a tile past the even rows', and the last row's half a tile below its step.
  worldSize(): Size {
    if (!this.#worldSize) {
      this.#worldSize = {
        width: this.#world.width() * this.#width + this.#width / 2,
        height: ((this.#world.height() + 1) * this.#height) / 2,
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
            ? (rows * this.#height) / 2
            : null,
      };
    }

    return this.#wrapPeriod;
  }
}

export default IsoProjection;
