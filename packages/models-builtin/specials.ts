// The built-in set's specials (docs/3d-renderer.md §5.2, plan 3.4): what each terrain feature the engine sends looks like
//  on its square, made by code, until a hosted set brings models (D3). Keyed by the engine's names for features, Civ1's
//  and Civ2's, as the client gets them (`terrain.features[]._`), and by `Terrain:Feature` where one looks different on
//  one terrain, as the tilesets key them (Civ1's Game is a doe in a forest and a caribou on the tundra). A feature the
//  table doesn't know is a cairn, so none is missing.
//
// Rivers are features too (Civ2's), but they're drawn as rivers (§5.3), not as a special.

/** What a special is drawn as. */
export type SpecialShape =
  // Lumps of something dug up: coal, gold, gems, iron.
  | 'rocks'
  // Something grown, in rows or bushes: wheat, spice, wine, silk, fruit.
  | 'crop'
  // A beast or two: horses, buffalo, game, furs, ivory, seals.
  | 'animal'
  // A bird or two: pheasants.
  | 'bird'
  // In the sea, at its surface: a shoal, or a whale's back.
  | 'fish'
  | 'whale'
  // An oil well's derrick.
  | 'derrick'
  // Palms round a pool.
  | 'oasis'
  // Cut turf, stacked.
  | 'peat'
  // Felled logs, stacked: Civ1's shield on grassland, Civ2's resources.
  | 'logs'
  // A pile of stones, for a feature the table doesn't know.
  | 'cairn';

export type SpecialLook = {
  shape: SpecialShape;
  // Its colour, and a second for its detail (a crop's stems, a beast's legs).
  colour: string;
  detail?: string;
  // How many: lumps, plants, beasts.
  count: number;
};

const look = (
  shape: SpecialShape,
  colour: string,
  count: number,
  detail?: string
): SpecialLook => ({
  shape,
  colour,
  count,
  ...(detail === undefined ? {} : { detail }),
});

export const specialTable: { readonly [feature: string]: SpecialLook } = {
  // Dug up.
  Coal: look('rocks', '#26262a', 4),
  Gold: look('rocks', '#d8b13a', 3),
  Gems: look('rocks', '#59c2d6', 4, '#b05ad0'),
  Iron: look('rocks', '#8a5a44', 4),
  // Grown.
  Wheat: look('crop', '#d9b84a', 5, '#a88a2c'),
  Spice: look('crop', '#c0452e', 4, '#5d7a2a'),
  Wine: look('crop', '#6a2c5e', 4, '#5d7a2a'),
  Silk: look('crop', '#e9e2cf', 3, '#4f7a34'),
  Fruit: look('crop', '#e08a2a', 4, '#3f7a2a'),
  // Beasts.
  Horse: look('animal', '#7a4e2a', 2, '#3a2a1c'),
  Buffalo: look('animal', '#4a3424', 3, '#2a1e16'),
  Game: look('animal', '#a9835a', 2, '#5a4430'),
  'Tundra:Game': look('animal', '#8f7e66', 2, '#e8e2d6'),
  Furs: look('animal', '#b0602a', 2, '#f0e8dc'),
  Ivory: look('animal', '#8a8580', 1, '#f2ead8'),
  Seal: look('animal', '#6e7072', 2, '#4a4c4e'),
  Pheasant: look('bird', '#8a3a22', 2, '#3d6a3a'),
  // In the sea.
  Fish: look('fish', '#b8c4cc', 5),
  Whales: look('whale', '#3a4048', 1),
  // The rest.
  Oil: look('derrick', '#222224', 1, '#121214'),
  Oasis: look('oasis', '#3f7a32', 3, '#3f86a8'),
  Peat: look('peat', '#4a3624', 4),
  Shield: look('logs', '#7a5532', 4, '#c9a47a'),
};

/** The cairn a feature the table doesn't know is drawn as. */
export const unknownSpecial: SpecialLook = look('cairn', '#9a9690', 5);

/**
 * What the feature `feature` looks like on a square of `terrain`: the table's entry for the two, or for the feature,
 *  or a cairn.
 */
export const specialLook = (terrain: string, feature: string): SpecialLook => {
  const own = (key: string): SpecialLook | undefined =>
    Object.prototype.hasOwnProperty.call(specialTable, key)
      ? specialTable[key]
      : undefined;

  return own(`${terrain}:${feature}`) ?? own(feature) ?? unknownSpecial;
};

export default specialTable;
