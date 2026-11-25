// The built-in set's plants (docs/3d-renderer.md §5.1, plan 3.2): what grows on each terrain, made by code, until a
//  hosted set brings models (D3). Keyed by the engine's names for terrains. A terrain the table doesn't know grows
//  nothing: the land's own colour says what it is.
//
// For each kind that grows there: how many to a square, how big against their usual, and their colours. Forests are
//  conifers towards the poles and broadleaf towards the equator (`conifers`, the share at the equator, then at the
//  poles). Woods (`canopy`) grow as one across their squares, each kind as often as its count says.

/** Every kind of plant that grows, as the built-in set draws them, and a set of models may. */
export const PLANT_KINDS = [
  // Trees: a conifer's tiers, a broadleaf's crown, a palm's fronds, a dead trunk.
  'conifer',
  'broadleaf',
  'palm',
  'deadTree',
  // Low growth: a round bush, a spray of shrub, low scrub, reeds.
  'bush',
  'shrub',
  'scrub',
  'reeds',
  // Not plants, but scattered as they are: rocks, and a cactus.
  'rock',
  'cactus',
] as const;

/** What grows: one of `PLANT_KINDS`. */
export type PlantKind = (typeof PLANT_KINDS)[number];

export type Plant = {
  kind: PlantKind;
  // How many to a square.
  count: number;
  // How big, from the smallest to the biggest, against the kind's usual.
  size: readonly [number, number];
  // Its leaves, and its trunk or stems.
  colour: string;
  detail: string;
};

export type Growth = {
  plants: readonly Plant[];
  // For woods: how far apart their trees' lattice points are, about, where it isn't the woods' own (`CANOPY` on the
  //  map). Woods that grow as one (`canopy`) share it.
  spacing?: number;
  // For woods: what grows under the trees and in the clearings, on a lattice of its own `spacing` apart, about, `share`
  //  of its points planted where the woods are whole, each of `plants` as often as its count says. What's lower than a
  //  unit's stand grows in the clearing about a square's middle too.
  undergrowth?: { spacing: number; share: number; plants: readonly Plant[] };
  // For a forest: the share of its trees that are conifers, at the equator and at the poles.
  conifers?: readonly [number, number];
  // For woods, which grow as one across squares: which woods they are. Squares beside each other of the same woods
  //  (forest and jungle; swamp) are one canopy, running across the edge between them, and thin to a fringe where they
  //  meet other ground. Without one, a square's plants are its own, scattered about its middle.
  canopy?: string;
};

const plant = (
  kind: PlantKind,
  count: number,
  size: readonly [number, number],
  colour: string,
  detail: string
): Plant => ({ kind, count, size, colour, detail });

export const vegetationTable: { readonly [terrain: string]: Growth } = {
  Forest: {
    plants: [plant('conifer', 8, [0.95, 1.4], '#2c5230', '#4a3424')],
    conifers: [0.15, 0.95],
    canopy: 'woods',
    undergrowth: {
      spacing: 0.13,
      share: 0.6,
      plants: [
        plant('scrub', 4, [0.8, 1.2], '#4e6c36', '#4e6c36'),
        plant('bush', 2, [0.7, 1.0], '#466e34', '#466e34'),
      ],
    },
  },
  Jungle: {
    plants: [
      plant('broadleaf', 7, [1.05, 1.55], '#2b6a2a', '#4d3a26'),
      plant('palm', 2, [0.9, 1.2], '#3f8a34', '#6b5236'),
    ],
    canopy: 'woods',
    undergrowth: {
      spacing: 0.11,
      share: 0.7,
      plants: [
        plant('bush', 3, [0.8, 1.2], '#2f6b2a', '#2f6b2a'),
        plant('scrub', 3, [0.9, 1.25], '#3a7a30', '#3a7a30'),
        plant('shrub', 1, [0.8, 1.1], '#4a8a36', '#5a4a2e'),
      ],
    },
  },
  Swamp: {
    plants: [
      plant('reeds', 7, [0.8, 1.2], '#7a8a4a', '#5a6a38'),
      plant('deadTree', 2, [0.8, 1.1], '#4a4036', '#4a4036'),
    ],
    canopy: 'swamp',
    // As sparse as woods were, as a swamp's mostly open.
    spacing: 0.26,
  },
  Grassland: { plants: [plant('bush', 2, [0.8, 1.2], '#4e7a32', '#4e7a32')] },
  Plains: { plants: [plant('shrub', 3, [0.7, 1.1], '#7a7a3a', '#6a5a36')] },
  Tundra: { plants: [plant('scrub', 4, [0.7, 1.1], '#6a6a4e', '#5a5444')] },
  Hills: {
    plants: [
      plant('shrub', 2, [0.8, 1.1], '#5e6e36', '#5e5036'),
      plant('rock', 1, [0.8, 1.2], '#7d756a', '#7d756a'),
    ],
  },
  Mountains: { plants: [plant('rock', 3, [0.9, 1.4], '#77706a', '#77706a')] },
  Desert: {
    plants: [
      plant('rock', 2, [0.7, 1.1], '#a8936a', '#a8936a'),
      plant('cactus', 1, [0.8, 1.1], '#5a7a3e', '#5a7a3e'),
    ],
  },
};

/** What grows on `terrain`, or nothing. */
export const growthOf = (terrain: string): Growth | null =>
  Object.prototype.hasOwnProperty.call(vegetationTable, terrain)
    ? vegetationTable[terrain]!
    : null;

export default vegetationTable;
