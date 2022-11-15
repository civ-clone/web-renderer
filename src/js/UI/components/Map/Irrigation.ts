import { EntityInstance, NeighbourDirection, Tile } from '../../types';
import TerrainAbstract from './TerrainAbstract';

export class Terrain extends TerrainAbstract {
  renderTile(tile: Tile): void {
    super.renderTile(tile);

    if (tile.terrain._ === 'Unknown') {
      return;
    }

    const { x, y } = tile,
      hasIrrigation = tile.improvements.some(
        (improvement: EntityInstance): boolean => improvement._ === 'Irrigation'
      );

    if (!hasIrrigation) {
      return;
    }

    this.drawImage(`improvements/irrigation`, x, y);
  }
}

export default Terrain;
