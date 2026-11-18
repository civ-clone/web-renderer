// What the 3D map marks on a square (docs/3d-renderer-plan.md 1.3): its city and the unit on top of its stack, as plain
//  markers until the model sets draw them (M2, M4). Pure: the stage draws what this says.
//
// The unit on top is the one the 2D map draws there: the active unit if it's in the stack, or else the one with the best
//  defence, as the engine sends it. Hidden (`t`), only the active unit is marked, as on the 2D map.

import { City, Player, Tile, Unit } from '@civ-clone/ui-protocol/types';

/** Two colours, a civilization's first and second, as CSS colours. */
export type MarkerColours = readonly [string, string];

export type CityMarker = {
  name: string;
  size: number;
  colours: MarkerColours;
  walled: boolean;
  // In civil disorder, as the engine has declared it.
  disorder: boolean;
};

export type UnitMarker = {
  // The unit type's name, as the engine sends it.
  type: string;
  colours: MarkerColours;
  // How many units are in the stack.
  count: number;
  active: boolean;
  // Fortified, sleeping or at work: the engine's own word for what it's doing.
  busy: boolean;
};

export type TileMarker = {
  city: CityMarker | null;
  unit: UnitMarker | null;
};

// Grey, for a player whose civilization doesn't say its colours.
const NO_COLOURS: MarkerColours = ['#9a9a9a', '#4a4a4a'];

/** A player's first two colours, as their civilization's `colors` attribute lists them. */
export const coloursOf = (
  player: Pick<Player, 'civilization'>
): MarkerColours => {
  const colours = player.civilization?.attributes?.find(
    (attribute) => attribute.name === 'colors'
  )?.value;

  if (!Array.isArray(colours) || typeof colours[0] !== 'string') {
    return NO_COLOURS;
  }

  return [colours[0], typeof colours[1] === 'string' ? colours[1] : colours[0]];
};

/** The unit the 2D map draws on top of `units`: the active one, if it's there, or else the best defender. */
export const unitOnTop = (
  units: readonly Unit[],
  activeUnitId: string | null
): Unit | null =>
  units.find((unit) => unit.id === activeUnitId) ??
  [...units].sort(
    (a, b) => (b.defence?.value ?? 0) - (a.defence?.value ?? 0)
  )[0] ??
  null;

/** How the page words what markers show, as its other maps and windows do: a city's name. */
export type MarkerWords = {
  cityName?: (city: City) => string;
};

/**
 * What to mark on `tile`, with the unit `activeUnitId` active, and the units and cities `shown` or hidden (`t`):
 *  nothing, for a square with neither. Its words are the page's, where it gives them.
 */
export const markerFor = (
  tile: Pick<Tile, 'city' | 'units'>,
  activeUnitId: string | null,
  shown: boolean,
  words: MarkerWords = {}
): TileMarker | null => {
  const units = tile.units ?? [],
    top = unitOnTop(units, activeUnitId),
    active = top !== null && top.id === activeUnitId,
    city: CityMarker | null =
      shown && tile.city
        ? {
            name: words.cityName?.(tile.city) ?? tile.city.name,
            size: tile.city.growth?.size ?? 1,
            colours: coloursOf(tile.city.player),
            walled: tile.city.walled === true,
            disorder: tile.city.civilDisorderDeclared === true,
          }
        : null,
    unit: UnitMarker | null =
      top !== null && (shown || active)
        ? {
            type: top._,
            colours: coloursOf(top.player),
            count: units.length,
            active,
            busy: top.busy !== null && top.busy !== undefined,
          }
        : null;

  return city === null && unit === null ? null : { city, unit };
};

export default markerFor;
