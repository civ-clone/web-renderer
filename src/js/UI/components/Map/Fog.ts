import TerrainAbstract from './TerrainAbstract';
import { Tile } from '../../types';

export class Fog extends TerrainAbstract {
  protected drawTile(tile: Tile, offsetX: number, offsetY: number): void {
    if (tile.terrain._ === 'Unknown') {
      return;
    }

    this.filterNeighbours(tile, (tile) => tile.terrain._ === 'Unknown').forEach(
      (direction) => this.drawImage(`map/fog_${direction}`, offsetX, offsetY)
    );
  }
}

export default Fog;
