// The built-in set's terrain table (docs/3d-renderer.md §4.1, §10): each terrain's relief, which the land's height is
//  blended from, and the flat colour it's drawn in until the surface has materials (slice 3.1). Keyed by the engine's
//  names for terrains, Civ1's and Civ2's, as the client gets them (`tile.terrain._`).
//
// Heights are in world units, a square being about 1 across (§3): exaggerated, so relief reads from above (D2). The
//  palette is natural and muted.

/** How a terrain's height varies across it. */
export type ReliefShape =
  // Level: no noise.
  | 'flat'
  // Gentle swells.
  | 'rolling'
  // Sharp crests where the noise turns.
  | 'ridged'
  // A peak at the square's middle that stays inside the square (§4.1), with ridges on it.
  | 'peaked';

export type Relief = {
  // The height the terrain sits at.
  base: number;
  // How far the noise takes it above or below that.
  roughness: number;
  shape: ReliefShape;
};

export type TerrainEntry = {
  relief: Relief;
  // A CSS hex colour.
  colour: string;
};

/**
 * The sea's floor (§4.1): shallow at the shore, falling away to `deep` within `reach` squares of land, by how far the
 *  square is from land.
 */
export const seaFloor = { shore: -0.03, deep: -0.15, reach: 3 } as const;

/** A square the player has never seen (`Unknown`): flat, at sea level, under cloud (§4.5). */
export const unknownTerrain: TerrainEntry = {
  relief: { base: 0, roughness: 0, shape: 'flat' },
  colour: '#1b1f24',
};

// What a terrain the table doesn't know is drawn as.
const grassland: TerrainEntry = {
  relief: { base: 0.03, roughness: 0.015, shape: 'rolling' },
  colour: '#6b8746',
};

export const terrainTable: { readonly [terrain: string]: TerrainEntry } = {
  // The sea's floor is `seaFloor`'s, by distance from land: this is its deepest.
  Ocean: {
    relief: { base: seaFloor.deep, roughness: 0.008, shape: 'rolling' },
    colour: '#33505f',
  },
  Grassland: grassland,
  Plains: {
    relief: { base: 0.025, roughness: 0.01, shape: 'rolling' },
    colour: '#99935a',
  },
  Desert: {
    relief: { base: 0.025, roughness: 0.025, shape: 'rolling' },
    colour: '#c4ab78',
  },
  Tundra: {
    relief: { base: 0.035, roughness: 0.015, shape: 'rolling' },
    colour: '#8a8d78',
  },
  Arctic: {
    relief: { base: 0.05, roughness: 0.02, shape: 'rolling' },
    colour: '#dfe6ea',
  },
  Glacier: {
    relief: { base: 0.08, roughness: 0.03, shape: 'rolling' },
    colour: '#e7eff3',
  },
  Forest: {
    relief: { base: 0.04, roughness: 0.02, shape: 'rolling' },
    colour: '#40583a',
  },
  Jungle: {
    relief: { base: 0.03, roughness: 0.02, shape: 'rolling' },
    colour: '#355a36',
  },
  // A low, wet hollow, close to the water.
  Swamp: {
    relief: { base: 0.005, roughness: 0.004, shape: 'flat' },
    colour: '#4f5b3d',
  },
  // Civ1's river is a terrain of its own: a low valley.
  River: {
    relief: { base: 0.012, roughness: 0.006, shape: 'rolling' },
    colour: '#5d7c4f',
  },
  Hills: {
    relief: { base: 0.12, roughness: 0.04, shape: 'ridged' },
    colour: '#7b7650',
  },
  Mountains: {
    relief: { base: 0.35, roughness: 0.08, shape: 'peaked' },
    colour: '#77726a',
  },
};

/** The table's entry for a terrain, `Unknown`'s for one never seen, and `Grassland`'s for one it doesn't know. */
export const terrainEntry = (terrain: string): TerrainEntry =>
  terrain === 'Unknown'
    ? unknownTerrain
    : (Object.prototype.hasOwnProperty.call(terrainTable, terrain)
        ? terrainTable[terrain]
        : undefined) ?? grassland;
