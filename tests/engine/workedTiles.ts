// Loading a save releases tiles still worked by a destroyed city (#4).
//
// `civ1-city` used to leave one behind when a size 1 city was captured, and
// saves made before the fix still carry it: the tile shows as worked by
// another city and the city actually there cannot work it.

import City from '@civ-clone/core-city/City';
import Game from '@civ-clone/core-game/Game';
import Tile from '@civ-clone/core-world/Tile';
import WorkedTile from '@civ-clone/core-city/WorkedTile';
import WorkedTileRegistry from '@civ-clone/core-city/WorkedTileRegistry';
import { releaseTilesOfDestroyedCities } from '../../src/js/Engine/loadGame';

// Only `destroyed()` is read, and tiles are only compared by identity.
const city = (destroyed: boolean) =>
    ({ destroyed: () => destroyed } as unknown as City),
  tile = () => ({} as Tile),
  workedTiles = new WorkedTileRegistry(),
  live = city(false),
  dead = city(true),
  kept = [new WorkedTile(tile(), live), new WorkedTile(tile(), live)],
  stale = new WorkedTile(tile(), dead);

workedTiles.register(...kept, stale);

releaseTilesOfDestroyedCities({ workedTiles } as unknown as Game);

const remaining = workedTiles.entries();

if (
  remaining.length !== kept.length ||
  !kept.every((workedTile) => remaining.includes(workedTile)) ||
  workedTiles.getByTile(stale.tile()) !== null
) {
  console.error(
    `FAIL workedTiles: expected only the live city's ${kept.length} tiles, got ${remaining.length}`
  );

  process.exit(1);
}

console.log('PASS workedTiles (stale tile of a destroyed city released)');
