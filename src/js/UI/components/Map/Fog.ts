import TerrainAbstract from './TerrainAbstract';
import { Tile } from '../../types';

export class Fog extends TerrainAbstract {
  renderTile(tile: Tile): void {
    super.renderTile(tile);

    if (tile.terrain._ === 'Unknown') {
      return;
    }

    const { x, y } = tile;

    this.filterNeighbours(tile, (tile) => tile.terrain._ === 'Unknown').forEach(
      (direction) => this.drawImage(`map/fog_${direction}`, x, y)
    );
  }
}

export default Fog;
