import TerrainAbstract from './TerrainAbstract';
import { Tile } from '../../types';

export class Fog extends TerrainAbstract {
  protected drawTile(tile: Tile, offsetX: number, offsetY: number): void {
    if (tile.terrain._ === 'Unknown') {
      return;
    }

    const { fog } = this.tileset().families;

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
