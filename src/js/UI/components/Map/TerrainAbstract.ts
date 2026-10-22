import { Tile } from '../../types';
import { Map, IMap } from '../Map';

export class TerrainAbstract extends Map implements IMap {
  update(tilesToUpdate: Tile[]): void {
    // A tile's terrain joins up with its neighbours', so they are drawn again too, each of them once. Told apart by
    //  where they are, as the tiles an update names aren't the world's own objects and an unseen tile is a new object
    //  each time it is asked for: comparing objects drew most tiles of a whole-map update (a change of government)
    //  twice and unseen ones up to eight times, after comparing every tile with every other (#488).
    const world = this.world(),
      directions = world.topology().directions(),
      seen = new Set<string>(),
      extendedTilesToUpdate: Tile[] = [],
      add = ({ x, y }: Tile): void => {
        const tile = world.get(x, y),
          key = `${tile.x},${tile.y}`;

        if (seen.has(key)) {
          return;
        }

        seen.add(key);
        extendedTilesToUpdate.push(tile);
      };

    tilesToUpdate.forEach(add);

    tilesToUpdate.forEach((tile) =>
      directions.forEach((direction) =>
        add(world.getNeighbour(tile, direction))
      )
    );

    return super.update(extendedTilesToUpdate);
  }
}

export default TerrainAbstract;
