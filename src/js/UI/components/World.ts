import { NeighbourDirection, Tile, World as WorldData } from '../types';

export class World {
  #unknown = (x: number, y: number): Tile => ({
    _: 'Tile',
    __: ['Tile', 'DataObject'],
    id: `Tile-${x}--${y}`,
    city: null,
    goodyHut: null,
    improvements: [],
    isCoast: false,
    isLand: false,
    isWater: false,
    terrain: {
      _: 'Unknown',
      __: ['Unknown', 'Terrain', 'DataObject'],
      id: `UnknownTerrain-${x}--${y}`,
      features: [],
    },
    units: [],
    workedBy: null,
    x,
    y,
    yields: [],
  });
  #lookup = new Map<string, Tile>();
  #tiles: Tile[];
  #height: number;
  #width: number;

  constructor(world: WorldData) {
    this.#height = world.height;
    this.#width = world.width;
    this.#tiles = world.tiles || [];

    this.rebuildLookup();
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

    if (!this.#lookup.has(key)) {
      return this.#unknown(x, y);
    }

    return this.#lookup.get(key)!;
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

    this.rebuildLookup();
  }

  private rebuildLookup(): void {
    this.#lookup.clear();

    this.#tiles.forEach((tile) => {
      this.#lookup.set([tile.x, tile.y].toString(), tile);
    });
  }
}

export default World;
