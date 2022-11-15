import TerrainAbstract from './TerrainAbstract';
import { Tile } from '../../types';

export class Terrain extends TerrainAbstract {
  renderTile(tile: Tile): void {
    super.renderTile(tile);

    if (tile.terrain._ === 'Unknown') {
      return;
    }

    const { x, y } = tile;

    if (tile.goodyHut !== null) {
      this.drawImage('map/hut', x, y);
    }
  }
}

export default Terrain;
