import { NeighbourDirection, Tile } from '../../types';
import { Map, IMap } from '../Map';

export class TerrainAbstract extends Map implements IMap {
  update(tilesToUpdate: Tile[]): void {
    // we need to redraw the surrounding tiles to prevent the hidden terrain showing up incorrectly.
    const extendedTilesToUpdate = [...tilesToUpdate];

    tilesToUpdate.forEach((tile) => {
      (
        ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as NeighbourDirection[]
      ).forEach((direction) => {
        const target = this.world().getNeighbour(tile, direction);

        if (extendedTilesToUpdate.includes(target)) {
          return;
        }

        extendedTilesToUpdate.push(target);
      });
    });

    return super.update(extendedTilesToUpdate);
  }
}

export default TerrainAbstract;
