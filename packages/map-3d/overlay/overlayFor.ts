// What the 3D map lays on a square's land (docs/3d-renderer.md §5.2, §5.4, plan 3.4): its roads and railroads, joined to
//  their neighbours as the 2D map joins them; irrigation or farmland; a mine, a fortress, an airbase; pollution; its
//  specials; a hut. Pure: `overlayMesh.ts` makes the shapes.
//
// Roads join as the 2D map's do (`packages/map/components/Map/Landscape.ts`): a road joins each neighbour with a road;
//  a railroad joins each with a railroad or a city; a road isn't drawn under a railroad going the same way; and one
//  that joins nothing is drawn on its own. The ways are the world's topology's, so a road follows square, hex or
//  diamond neighbours alike. What's there is the engine's to say: this only draws it.

import { Tile } from '@civ-clone/ui-protocol/types';

/** A neighbour of a square: how far off it is, in squares, before the world wraps, and what's on it. */
export type OverlayNeighbour = {
  offset: readonly [number, number];
  tile: Pick<Tile, 'city' | 'improvements'>;
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
};

// Features drawn otherwise than as a special: Civ2's rivers, which are drawn as rivers (§5.3).
const NOT_SPECIALS = ['River'];

const has = (tile: Pick<Tile, 'improvements'>, name: string): boolean =>
  (tile.improvements ?? []).some(({ _ }) => _ === name);

/** What's laid on `tile`'s land, its `neighbours` all round it: nothing, for a square with none of it. */
export const overlayFor = (
  tile: Pick<Tile, 'improvements' | 'terrain' | 'goodyHut'>,
  neighbours: readonly OverlayNeighbour[]
): SquareOverlay | null => {
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
    };

  const empty =
    overlay.road === null &&
    overlay.irrigation === null &&
    !overlay.mine &&
    !overlay.fortress &&
    !overlay.airbase &&
    !overlay.pollution &&
    overlay.specials.length === 0 &&
    !overlay.hut;

  return empty ? null : overlay;
};

export default overlayFor;
