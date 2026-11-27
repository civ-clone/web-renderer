// The built-in set's terrain table (docs/3d-renderer.md §4.1, §4.3, §10): each terrain's relief, which the land's height
//  is blended from, the colour it's drawn in, and the material whose detail is drawn over that colour close to (§4.3).
//  Keyed by the engine's names for terrains, Civ1's and Civ2's, as the client gets them (`tile.terrain._`).
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

/**
 * The surfaces the land's drawn with (§4.3), each a material whose detail (its grain, its bumps, how it shines) is
 *  drawn over the land's colour: in this order, which the land's mesh and the textures made for them share.
 */
export const SURFACES = [
  'grass',
  'plains',
  'sand',
  'rock',
  'snow',
  'forest',
  'mud',
  'tundra',
] as const;

export type Surface = (typeof SURFACES)[number];

export type TerrainEntry = {
  relief: Relief;
  // A CSS hex colour.
  colour: string;
  // The material its ground is.
  surface: Surface;
};

/**
 * The sea's floor (§4.1): shallow at the shore, falling away to `deep` within `reach` squares of land, by how far the
 *  square is from land.
 */
export const seaFloor = { shore: -0.03, deep: -0.15, reach: 3 } as const;

/**
 * A square the player has never seen (`Unknown`): no relief of its own, under cloud (§4.5); the land seen beside it
 *  carries on into it a little way (`UNDER_CLOUD` in the 3D map's `terrain/relief.ts`).
 */
export const unknownTerrain: TerrainEntry = {
  relief: { base: 0, roughness: 0, shape: 'flat' },
  colour: '#1b1f24',
  // Never drawn: a square never seen has no surface, and lends none to its neighbours.
  surface: 'grass',
};

// What a terrain the table doesn't know is drawn as.
const grassland: TerrainEntry = {
  relief: { base: 0.03, roughness: 0.015, shape: 'rolling' },
  colour: '#6b8746',
  surface: 'grass',
};

export const terrainTable: { readonly [terrain: string]: TerrainEntry } = {
  // The sea's floor is `seaFloor`'s, by distance from land: this is its deepest.
  Ocean: {
    // A calm floor: the sea's surface (slice 1.4) lies over it.
    relief: { base: seaFloor.deep, roughness: 0.003, shape: 'rolling' },
    colour: '#33505f',
    surface: 'sand',
  },
  Grassland: grassland,
  Plains: {
    relief: { base: 0.025, roughness: 0.01, shape: 'rolling' },
    colour: '#99935a',
    surface: 'plains',
  },
  Desert: {
    relief: { base: 0.025, roughness: 0.025, shape: 'rolling' },
    colour: '#c4ab78',
    surface: 'sand',
  },
  Tundra: {
    relief: { base: 0.035, roughness: 0.015, shape: 'rolling' },
    colour: '#8a8d78',
    surface: 'tundra',
  },
  Arctic: {
    relief: { base: 0.05, roughness: 0.02, shape: 'rolling' },
    colour: '#dfe6ea',
    surface: 'snow',
  },
  Glacier: {
    relief: { base: 0.08, roughness: 0.03, shape: 'rolling' },
    colour: '#e7eff3',
    surface: 'snow',
  },
  Forest: {
    relief: { base: 0.04, roughness: 0.02, shape: 'rolling' },
    colour: '#40583a',
    surface: 'forest',
  },
  Jungle: {
    relief: { base: 0.03, roughness: 0.02, shape: 'rolling' },
    colour: '#355a36',
    surface: 'forest',
  },
  // A low, wet hollow, close to the water.
  Swamp: {
    relief: { base: 0.005, roughness: 0.004, shape: 'flat' },
    colour: '#4f5b3d',
    surface: 'mud',
  },
  // Civ1's river is a terrain of its own: a low valley.
  River: {
    relief: { base: 0.012, roughness: 0.006, shape: 'rolling' },
    colour: '#5d7c4f',
    surface: 'grass',
  },
  Hills: {
    relief: { base: 0.16, roughness: 0.08, shape: 'ridged' },
    colour: '#7b7650',
    surface: 'plains',
  },
  Mountains: {
    relief: { base: 0.75, roughness: 0.15, shape: 'peaked' },
    colour: '#77726a',
    surface: 'rock',
  },
};

/** The table's entry for a terrain, `Unknown`'s for one never seen, and `Grassland`'s for one it doesn't know. */
export const terrainEntry = (terrain: string): TerrainEntry =>
  terrain === 'Unknown'
    ? unknownTerrain
    : (Object.prototype.hasOwnProperty.call(terrainTable, terrain)
        ? terrainTable[terrain]
        : undefined) ?? grassland;
