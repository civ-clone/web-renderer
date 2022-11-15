import { NeighbourDirection, Tile, World as WorldData } from '../types';

export class World {
  #unknown = (x: number, y: number): Tile => ({
    _: 'Tile',
    id: `Tile-${x}--${y}`,
    city: null,
    goodyHut: null,
    improvements: [],
    isCoast: false,
    isLand: false,
    isWater: false,
    terrain: {
      _: 'Unknown',
      id: `UnknownTerrain-${x}--${y}`,
      features: [],
    },
    units: [],
    x,
    y,
    yields: [],
  });
  #lookupCache: { [key: string]: number } = {};
  #tiles: Tile[];
  #height: number;
  #width: number;

  constructor(world: WorldData) {
    this.#height = world.height;
    this.#width = world.width;
    this.#tiles = world.tiles || [];
  }

  get(x: number, y: number): Tile {
    while (x < 0) {
      x += this.#width;
    }

    while (y < 0) {
      y += this.#height;
    }

    while (x >= this.#width) {
      x -= this.#width;
    }

    while (y >= this.#height) {
      y -= this.#height;
    }

    const key = [x, y].toString();

    if (!(key in this.#lookupCache)) {
      const index = this.#tiles.findIndex(
        (tile) => tile.x === x && tile.y === y
      );

      if (index === -1) {
        return this.#unknown(x, y);
      }

      this.#lookupCache[key] = index;
    }

    return this.#tiles[this.#lookupCache[key]];
  }

  getNeighbour(tile: Tile, direction: NeighbourDirection): Tile {
    if (direction === 'n') {
      return this.get(tile.x, tile.y - 1);
    }

    if (direction === 'ne') {
      return this.get(tile.x + 1, tile.y - 1);
    }

    if (direction === 'e') {
      return this.get(tile.x + 1, tile.y);
    }

    if (direction === 'se') {
      return this.get(tile.x + 1, tile.y + 1);
    }

    if (direction === 's') {
      return this.get(tile.x, tile.y + 1);
    }

    if (direction === 'sw') {
      return this.get(tile.x - 1, tile.y + 1);
    }

    if (direction === 'w') {
      return this.get(tile.x - 1, tile.y);
    }

    if (direction === 'nw') {
      return this.get(tile.x - 1, tile.y - 1);
    }

    throw new TypeError('Invalid direction.');
  }

  height(): number {
    return this.#height;
  }

  tiles(): Tile[] {
    return this.#tiles;
  }

  width(): number {
    return this.#width;
  }

  setTiles(tiles: Tile[]): void {
    this.#tiles = tiles;
  }
}

export default World;
