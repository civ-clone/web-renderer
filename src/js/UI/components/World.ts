import { NeighbourDirection, Tile, World as WorldData } from '../types';
import topologyFor, { Topology } from '../lib/topologyFor';

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
  #topology: Topology;
  #width: number;

  constructor(world: WorldData) {
    this.#height = world.height;
    this.#width = world.width;
    this.#tiles = world.tiles || [];
    this.#topology = topologyFor(world);

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

  // The tile next to `tile` in `direction`, as the world's topology says. A tile off an edge that does not wrap is
  //  unknown, as a tile not seen yet is.
  getNeighbour(tile: Tile, direction: NeighbourDirection): Tile {
    const neighbour = this.#topology.neighbour(tile.x, tile.y, direction);

    if (neighbour === null) {
      const [dx, dy] = this.#topology.offset(direction, tile.x, tile.y);

      return this.#unknown(tile.x + dx, tile.y + dy);
    }

    return this.get(neighbour[0], neighbour[1]);
  }

  height(): number {
    return this.#height;
  }

  tiles(): Tile[] {
    return this.#tiles;
  }

  /** The shape of the world's grid: which tile neighbours which, and which ways there are (#88). */
  topology(): Topology {
    return this.#topology;
  }

  width(): number {
    return this.#width;
  }

  // `changed` when the world's tiles may be other tiles than last time, as when
  //  a patch re-sends the world for a tile newly seen: the list can be the same
  //  array with new contents. Otherwise the lookup still holds the right
  //  tiles, as the data keeps one object per tile however often it changes
  //  (#327).
  setTiles(tiles: Tile[], changed: boolean): void {
    if (!changed && tiles === this.#tiles) {
      return;
    }

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
