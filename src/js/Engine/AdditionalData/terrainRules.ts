import AdditionalData from '@civ-clone/core-data-object/AdditionalData';
import Terrain from '@civ-clone/core-terrain/Terrain';
import { terrainDefence } from '@civ-clone/civ1-unit/Rules/Unit/strength';
import { terrainMovementCost } from '@civ-clone/civ1-unit/Rules/Unit/movementCost';

/**
 * What a square's terrain does for a unit on it, so the map's tooltip can say so (#748): the multiplier a defender
 * there gets (`1` where it gets none), and what moving onto it costs without a road: a land unit's, or on water a
 * ship's (`null` for a terrain the table doesn't have). Both are Civ1's tables, which the engine already caches, as
 * every tile's terrain carries them.
 */
export const terrainDefenceBonus = (): AdditionalData =>
  new AdditionalData(Terrain, 'defence', (terrain: Terrain): number => {
    const match = terrainDefence.find(
      ([TerrainType]): boolean => terrain instanceof TerrainType
    );

    return match === undefined ? 1 : match[1];
  });

export const terrainMoveCost = (): AdditionalData =>
  new AdditionalData(
    Terrain,
    'movementCost',
    (terrain: Terrain): number | null => terrainMovementCost(terrain)
  );
