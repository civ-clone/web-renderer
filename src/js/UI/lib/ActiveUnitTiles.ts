import { Tile } from '../types';

type TileHolder = {
  tile: Tile;
};

// `Units` skips whichever tile holds the active unit, so a change of active
//  unit leaves two tiles stale on that layer: the one being vacated, which has
//  to draw its unit again, and the one taking over, which has to stop drawing
//  it. Keyed by coordinate to dedupe, since several changes can land in a
//  single frame.
export class ActiveUnitTiles {
  #stale = new Map<string, Tile>();
  // Where the active unit stood when it was made active. Not its `tile` now:
  //  an update refills the unit in place (#327), so by the next change that can
  //  be the tile it moved to. A tile's object keeps its coordinates however
  //  often it is refilled.
  #tile: Tile | null = null;

  change(unit: TileHolder | null): void {
    [this.#tile, unit?.tile ?? null].forEach((tile) => {
      if (tile) {
        this.#stale.set(`${tile.x},${tile.y}`, tile);
      }
    });

    this.#tile = unit?.tile ?? null;
  }

  take(): Tile[] {
    const tiles = [...this.#stale.values()];

    this.#stale.clear();

    return tiles;
  }
}

export default ActiveUnitTiles;
