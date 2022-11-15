import TerrainAbstract from './TerrainAbstract';
import { Tile } from '../../types';

export class Terrain extends TerrainAbstract {
  renderTile(tile: Tile): void {
    super.renderTile(tile);

    if (tile.terrain._ === 'Unknown') {
      return;
    }

    const { x, y } = tile;

    const adjoining = this.filterNeighbours(
      tile,
      (adjoiningTile: Tile): boolean =>
        (tile.terrain._ === 'River' && adjoiningTile.isWater) ||
        tile.terrain._ === adjoiningTile.terrain._
    ).join('');

    // Ocean is covered with the land/ocean stuff above and if we re-do here, we lose the coastline
    if (tile.terrain._ !== 'Ocean') {
      if (adjoining) {
        this.drawImage(
          `terrain/${tile.terrain._.toLowerCase()}_${adjoining}`,
          x,
          y
        );
      } else {
        this.drawImage(`terrain/${tile.terrain._.toLowerCase()}`, x, y);
      }
    }
  }
}

export default Terrain;
