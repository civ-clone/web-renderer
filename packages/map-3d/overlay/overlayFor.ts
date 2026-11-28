// What the 3D map lays on a square's land (docs/3d-renderer.md §5, plan 3.2 and 3.4): its roads and railroads, joined to
//  their neighbours as the 2D map joins them; irrigation or farmland; a mine, a fortress, an airbase; pollution; its
//  specials; a hut; and what grows there. Pure: `overlayMesh.ts` makes the shapes.
//
// Roads join as the 2D map's do (`packages/map/components/Map/Landscape.ts`): a road joins each neighbour with a road;
//  a railroad joins each with a railroad or a city; a road isn't drawn under a railroad going the same way; and one
//  that joins nothing is drawn on its own. The ways are the world's topology's, so a road follows square, hex or
//  diamond neighbours alike. What's there is the engine's to say: this only draws it.

import { Tile } from '@civ-clone/ui-protocol/types';
import { growthOf } from '@civ-clone/ui-models-builtin/vegetation';
import { disorderColumns } from './disorder';
import {
  CityPlan,
  SuburbPlan,
  citySeed,
  planFor,
  suburbStepsFor,
} from './sprawl';

/** A neighbour of a square: how far off it is, in squares, before the world wraps, and what's on it. */
export type OverlayNeighbour = {
  offset: readonly [number, number];
  tile: Pick<Tile, 'city' | 'improvements'> & Partial<Pick<Tile, 'terrain'>>;
};

/** The ways a road or railroad leaves its square, by its neighbours' offsets, or that it's on its own. */
export type Route = {
  joins: (readonly [number, number])[];
  alone: boolean;
};

export type SquareOverlay = {
  road: Route | null;
  railroad: Route | null;
  irrigation: 'irrigation' | 'farmland' | null;
  mine: boolean;
  fortress: boolean;
  airbase: boolean;
  pollution: boolean;
  // Its features drawn as specials, as `[terrain, feature]`: not those drawn some other way (rivers).
  specials: (readonly [string, string])[];
  hut: boolean;
  // Its terrain, and whether anything grows on it (`growthOf`): on a city's lot, nothing grows, as its sprawl's laid.
  terrain: string;
  vegetation: boolean;
  // For woods, its neighbours of the same woods that grow them (`Growth#canopy`), by offset: the canopy runs across
  //  to them. Not one on a city's lot, or cleared (fields, a fortress, an airbase), or never seen.
  woods: (readonly [number, number])[];
  // For woods, or a square with a city's houses on it, its neighbours with a road or a city, by offset: a road between
  //  two of them that crosses this square's corner, a diagonal road beside it, is one its trees and houses keep clear of
  //  too.
  paths: (readonly [number, number])[];
  // A city's lot, laid out as its sprawl (`sprawl.ts`): its seed, how many lots it's built and how tall, the ways its
  //  streets go out, by its neighbours' offsets (a road coming in), and its neighbours of sea, the way its quay's to
  //  be. Nothing else is laid on a city's lot.
  city: CityPlan | null;
  // The houses of each city beside it that has spread onto it (`suburb`), by its seed, how far out it's spread, and the
  //  offset to it: on land that isn't steep or taken by a mine, a fortress or an airbase. Fields give way to them.
  suburbs: SuburbPlan[];
  // Where it has them, every city beside it, whatever its size, by offset: each builds on its own side, and the ways in
  //  to each are kept clear.
  beside: (readonly [number, number])[];
  // A city's lot with its town hidden (`t`, `Land#showTowns`), laid as the land it stands on: a unit there still stands
  //  in front of where its buildings are, so what grows keeps clear of that spot, as of the middle.
  front?: true;
};

// Terrain a city's quay runs down to.
const SEA = ['Ocean'];

// Terrain too steep to build on.
const STEEP = ['Mountains'];

// Improvements that take the ground, so a city's houses don't spill onto it.
const UNBUILT = ['Mine', 'Fortress', 'Airbase'];

// Features drawn otherwise than as a special: Civ2's rivers, which are drawn as rivers (§5.3).
const NOT_SPECIALS = ['River'];

const has = (tile: Pick<Tile, 'improvements'>, name: string): boolean =>
  (tile.improvements ?? []).some(({ _ }) => _ === name);

// Ground cleared of what grows there: fields, a fortress, an airbase.
const CLEARED = ['Irrigation', 'Farmland', 'Fortress', 'Airbase'];

/** The woods `tile` grows (`Growth#canopy`), or none: none on a city's lot, or on cleared ground. */
export const woodsOf = (
  tile: Pick<Tile, 'improvements'> & Partial<Pick<Tile, 'city' | 'terrain'>>
): string | null =>
  tile.city || CLEARED.some((name) => has(tile, name))
    ? null
    : growthOf(tile.terrain?._ ?? 'Unknown')?.canopy ?? null;

/**
 * What's laid on `tile`'s land, its `neighbours` all round it: nothing, for a square with none of it; or a city's lot,
 *  its sprawl, which takes the square, as the 2D map's city covers its square's road and fields; and beside a city
 *  that's grown, its houses.
 */
export const overlayFor = (
  tile: Pick<Tile, 'improvements' | 'terrain' | 'goodyHut'> &
    Partial<Pick<Tile, 'city' | 'isWater'>>,
  neighbours: readonly OverlayNeighbour[]
): SquareOverlay | null => {
  if (tile.city) {
    const city = tile.city;

    return {
      road: null,
      railroad: null,
      irrigation: null,
      mine: false,
      fortress: false,
      airbase: false,
      pollution: false,
      specials: [],
      hut: false,
      terrain: tile.terrain?._ ?? 'Unknown',
      vegetation: false,
      woods: [],
      paths: [],
      // From its id, as the engine has it: the same city whoever holds it. Out to each neighbour whose road or railroad
      //  comes in, as it lays its half (a road where the city's square has one too, or a railroad, which joins a city),
      //  and towards the sea. In civil disorder, fires on its roofs (`disorder.ts`), as the city's shown.
      city: planFor(
        citySeed(String(city.id ?? city.name ?? '')),
        city.growth?.size ?? 1,
        neighbours
          .filter(
            ({ tile: neighbour }) =>
              has(neighbour, 'Road') &&
              (has(tile, 'Road') || has(neighbour, 'Railroad'))
          )
          .map(({ offset }) => offset),
        neighbours
          .filter(({ tile: neighbour }) =>
            SEA.includes(neighbour.terrain?._ ?? '')
          )
          .map(({ offset }) => offset),
        city.civilDisorderDeclared === true
          ? disorderColumns(city.growth?.size ?? 1)
          : 0
      ),
      suburbs: [],
      beside: [],
    };
  }

  const road = has(tile, 'Road'),
    railroad = has(tile, 'Railroad'),
    roadNeighbours = road
      ? neighbours
          .filter((neighbour) => has(neighbour.tile, 'Road'))
          .map(({ offset }) => offset)
      : [],
    // Looked for on a road too: a road beside a railroad or a city isn't on its own.
    railroadNeighbours = road
      ? neighbours
          .filter(
            (neighbour) =>
              Boolean(neighbour.tile.city) || has(neighbour.tile, 'Railroad')
          )
          .map(({ offset }) => offset)
      : [],
    same = (
      a: readonly [number, number],
      b: readonly [number, number]
    ): boolean => a[0] === b[0] && a[1] === b[1],
    // On its own when it joins nothing either way: drawn as a railroad if it is one.
    alone = roadNeighbours.length === 0 && railroadNeighbours.length === 0,
    overlay: SquareOverlay = {
      // Railroads need a road: a square with neither has no route at all.
      road: road
        ? {
            joins: roadNeighbours.filter(
              (offset) =>
                !railroad ||
                !railroadNeighbours.some((other) => same(other, offset))
            ),
            alone: alone && !railroad,
          }
        : null,
      railroad: road && railroad ? { joins: railroadNeighbours, alone } : null,
      irrigation: has(tile, 'Farmland')
        ? 'farmland'
        : has(tile, 'Irrigation')
        ? 'irrigation'
        : null,
      mine: has(tile, 'Mine'),
      fortress: has(tile, 'Fortress'),
      airbase: has(tile, 'Airbase'),
      pollution: has(tile, 'Pollution'),
      specials: (tile.terrain?.features ?? [])
        .map(({ _ }) => _)
        .filter((feature) => !NOT_SPECIALS.includes(feature))
        .map((feature): [string, string] => [tile.terrain._, feature]),
      hut: tile.goodyHut !== null && tile.goodyHut !== undefined,
      terrain: tile.terrain?._ ?? 'Unknown',
      vegetation: growthOf(tile.terrain?._ ?? 'Unknown') !== null,
      woods: [],
      paths: [],
      city: null,
      suburbs: [],
      beside: [],
    },
    own = woodsOf(tile),
    terrain = tile.terrain?._ ?? 'Unknown';

  // Each city beside it that's spread this far, on land a city builds on, in an order of their own, whichever way
  //  round they are.
  if (
    tile.isWater !== true &&
    !SEA.includes(terrain) &&
    terrain !== 'Unknown' &&
    !STEEP.includes(terrain) &&
    !UNBUILT.some((name) => has(tile, name))
  ) {
    overlay.suburbs = neighbours
      .flatMap(({ offset, tile: { city } }): SuburbPlan[] => {
        const steps = city ? suburbStepsFor(city.growth?.size ?? 1) : 0;

        return city && steps > 0
          ? [
              {
                seed: citySeed(String(city.id ?? city.name ?? '')),
                steps,
                city: offset,
              },
            ]
          : [];
      })
      .sort(
        (a, b) =>
          a.seed - b.seed || a.city[0] - b.city[0] || a.city[1] - b.city[1]
      );
  }

  if (overlay.suburbs.length > 0) {
    overlay.beside = neighbours
      .filter(({ tile: { city } }) => Boolean(city))
      .map(({ offset }) => offset);
  }

  if (own !== null) {
    overlay.woods = neighbours
      .filter((neighbour) => woodsOf(neighbour.tile) === own)
      .map(({ offset }) => offset);
  }

  if (own !== null || overlay.suburbs.length > 0) {
    overlay.paths = neighbours
      .filter(
        (neighbour) =>
          Boolean(neighbour.tile.city) || has(neighbour.tile, 'Road')
      )
      .map(({ offset }) => offset);
  }

  const empty =
    overlay.road === null &&
    overlay.irrigation === null &&
    !overlay.mine &&
    !overlay.fortress &&
    !overlay.airbase &&
    !overlay.pollution &&
    overlay.specials.length === 0 &&
    !overlay.hut &&
    !overlay.vegetation &&
    overlay.suburbs.length === 0;

  return empty ? null : overlay;
};

export default overlayFor;
