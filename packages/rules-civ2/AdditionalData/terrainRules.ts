import {
  defence,
  movementCost,
} from '@civ-clone/civ2-world/lib/terrainProperties';
import AdditionalData from '@civ-clone/core-data-object/AdditionalData';
import Terrain from '@civ-clone/core-terrain/Terrain';
import { cachedTerrainLookup } from '@civ-clone/base-terrain-properties/lib/terrainTable';

const defenceOf = cachedTerrainLookup(defence),
  movementCostOf = cachedTerrainLookup(movementCost);

/**
 * What a square's terrain does for a unit on it, so the map's tooltip can say so, as Civ1's does (#748): the
 * multiplier a defender there gets (`1` where it gets none), and what moving onto it costs without a road (`null` for
 * a terrain the table doesn't have). Both are civ2-world's `@TERRAIN` tables, which civ2-unit moves and fights by.
 */
export const terrainDefenceBonus = (): AdditionalData =>
  new AdditionalData(
    Terrain,
    'defence',
    (terrain: Terrain): number => defenceOf(terrain) ?? 1
  );

export const terrainMoveCost = (): AdditionalData =>
  new AdditionalData(
    Terrain,
    'movementCost',
    (terrain: Terrain): number | null => movementCostOf(terrain)
  );
