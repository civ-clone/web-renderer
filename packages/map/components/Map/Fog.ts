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

    // A tileset with no fog sprites draws the edge of what a player has seen without one: Civ2's, whose map shows a
    //  hard edge (M1's decision D7).
    if (fog === undefined) {
      return;
    }

    [offsetX, offsetY] = this.anchored(offsetX, offsetY);

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
