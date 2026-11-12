import TerrainAbstract from './TerrainAbstract';
import { Tile } from '@civ-clone/ui-protocol/types';

export class Fog extends TerrainAbstract {
  protected override drawTile(
    tile: Tile,
    offsetX: number,
    offsetY: number
  ): void {
    if (tile.terrain._ === 'Unknown') {
      return;
    }

    const { fog } = this.tileset().families;

    // A tileset with no fog sprites draws the edge of what a player has seen without one.
    if (fog === undefined) {
      return;
    }

    this.drawFamily(
      fog,
      this.filterNeighbours(
        tile,
        (tile) => tile.terrain._ === 'Unknown',
        this.familyDirections(fog)
      ),
      {},
      offsetX,
      offsetY
    );
  }
}

export default Fog;
