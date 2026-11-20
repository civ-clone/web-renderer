// What the 3D map marks on a square (docs/3d-renderer-plan.md 1.3, 2.1): its city and the unit on top of its stack, with
//  what the unit's flag shows (spec §6.3). Pure: the stage draws what this says.
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
  // The unit's own id, as the page has it.
  id: string;
  // The unit type's name, and the names of the kinds it's of (`Naval`, `Air`, …), as the engine sends them.
  type: string;
  kinds: readonly string[];
  colours: MarkerColours;
  // How many units are in the stack.
  count: number;
  active: boolean;
  // Fortified, sleeping or at work: the engine's own word for what it's doing.
  busy: boolean;
  // What the engine says of it: `Fortified` and `Veteran` among its improvements.
  fortified: boolean;
  veteran: boolean;
  // Its hit points as a fraction of its most, where the rules have them (Civ2) and it's hurt; `null` otherwise.
  health: number | null;
  // The letter for what it's busy with, as the 2D map writes it over the unit, or nothing.
  status: string | null;
  // Which way it faces on the ground, turned from south (`+v`) towards east (`+u`), in radians: the way it last moved,
  //  or last attacked, as the page saw it. South when it hasn't been seen to.
  facing: number;
  // How big its figures are drawn, as the player chose: 1 is life size.
  size: number;
};

export type TileMarker = {
  city: CityMarker | null;
  unit: UnitMarker | null;
  // Whether its square has a city, shown or hidden (`t`): a unit stands in front of the city's buildings, or where
  //  they'd stand with the towns hidden, either way. Where it's not said, where the city's marked.
  inCity?: boolean;
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

/**
 * How the page words what markers show, as its other maps and windows do: a city's name, and the letter for what a
 *  busy unit's doing.
 */
export type MarkerWords = {
  cityName?: (city: City) => string;
  unitStatus?: (unit: Unit) => string | null;
};

// A unit's hit points as a fraction of its most, when it has lost some.
const healthOf = (unit: Unit): number | null => {
  const { current, max } = unit.hitPoints ?? { current: 0, max: 0 };

  return max > 0 && current < max ? Math.max(0, current / max) : null;
};

/**
 * What to mark on `tile`, with the unit `activeUnitId` active, and the units and cities `shown` or hidden (`t`):
 *  nothing, for a square with neither. Its words are the page's, where it gives them.
 */
export const markerFor = (
  tile: Pick<Tile, 'city' | 'units'>,
  activeUnitId: string | null,
  shown: boolean,
  words: MarkerWords = {},
  facingOf: (unit: Unit) => number = () => 0,
  unitSize: number = 1
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
            id: top.id,
            type: top._,
            kinds: top.__ ?? [],
            colours: coloursOf(top.player),
            count: units.length,
            active,
            busy: top.busy !== null && top.busy !== undefined,
            fortified: (top.improvements ?? []).some(
              ({ _ }) => _ === 'Fortified'
            ),
            veteran: (top.improvements ?? []).some(({ _ }) => _ === 'Veteran'),
            health: healthOf(top),
            status: (top.busy ? words.unitStatus?.(top) : null) || null,
            facing: facingOf(top),
            size: unitSize,
          }
        : null;

  return city === null && unit === null
    ? null
    : { city, unit, inCity: Boolean(tile.city) };
};

export default markerFor;
