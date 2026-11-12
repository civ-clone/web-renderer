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

// A staggered isometric grid, for the suites, until the real one is drawable (#97): diamonds `tile` px across and
//  down, rows half a tile apart and every odd row shifted half a tile across, picked by the diamond a pixel is in
//  rather than the box. The world has to be an even number of rows high to wrap over the poles, as a staggered
//  isometric world does.
export class Staggered implements Projection {
  #step: { x: number; y: number };
  #tile: Size;
  #world: WorldDimensions;
  #wrapVertical: boolean;

  constructor(tile: Size, world: WorldDimensions, wrapVertical: boolean) {
    this.#tile = { ...tile };
    this.#step = { x: tile.width, y: tile.height / 2 };
    this.#world = world;
    this.#wrapVertical = wrapVertical;
  }

  compareDrawOrder(a: Placement, b: Placement): number {
    return a.py - b.py || a.px - b.px || a.y - b.y || a.x - b.x;
  }

  footprint(): Size {
    return this.#tile;
  }

  overlapsNeighbours(): boolean {
    return true;
  }

  // A pixel in the band between two rows' middles is in the lower row's diamond, or else in the upper row's, which
  //  fills the gaps between the lower row's diamonds. `& 1` rather than `% 2`, so a row above the world is shifted as
  //  the row a world's height below it is.
  pixelToTile(px: number, py: number): [number, number] {
    const { width, height } = this.#tile,
      band = Math.floor(py / (height / 2)),
      inRow = (row: number): [number, number, number] => {
        const shift = row & 1 ? width / 2 : 0,
          column = Math.floor((px - shift) / width),
          middleX = column * width + shift + width / 2,
          middleY = (row * height) / 2 + height / 2;

        return [
          column,
          row,
          Math.abs(px - middleX) / (width / 2) +
            Math.abs(py - middleY) / (height / 2),
        ];
      },
      [column, row, distance] = inRow(band);

    if (distance <= 1) {
      return [column, row];
    }

    const [aboveColumn, aboveRow] = inRow(band - 1);

    return [aboveColumn, aboveRow];
  }

  reach(): Reach {
    return noReach;
  }

  tileSpan({ x, y, width, height }: Rect, overhang: number): TileSpan {
    const tile = this.#tile,
      step = tile.height / 2;

    return {
      // Odd rows start half a tile across.
      columns: [
        Math.floor((x - overhang - tile.width / 2) / tile.width),
        Math.ceil((x + width + overhang) / tile.width),
      ],
      // A row's boxes are a whole tile high, so the row above still reaches down into the rectangle.
      rows: [
        Math.floor((y - overhang - tile.height) / step) + 1,
        Math.ceil((y + height + overhang) / step),
      ],
    };
  }

  tileStep(): { x: number; y: number } {
    return this.#step;
  }

  tileToPixel(x: number, y: number): [number, number] {
    const { width, height } = this.#tile;

    return [x * width + (y & 1 ? width / 2 : 0), (y * height) / 2];
  }

  worldSize(): Size {
    const { width, height } = this.#tile;

    return {
      width: this.#world.width() * width + width / 2,
      height: ((this.#world.height() + 1) * height) / 2,
    };
  }

  wrapPeriod(): { x: number; y: number | null } {
    const { width, height } = this.#tile;

    return {
      x: this.#world.width() * width,
      y: this.#wrapVertical ? (this.#world.height() * height) / 2 : null,
    };
  }
}

export default Staggered;
