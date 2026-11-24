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
  // Beasts, a few together: horses, oxen (buffalo), deer (game, and caribou on the tundra), foxes (furs), an elephant
  //  (ivory), seals; and birds (pheasants).
  | 'horse'
  | 'ox'
  | 'deer'
  | 'fox'
  | 'elephant'
  | 'seal'
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
  // Its colour, a second for its detail (a crop's stems, a beast's mane, hooves or flippers, logs' cut ends) and a
  //  third, pale, for a beast's horns, antlers, tusks or tail's tip.
  colour: string;
  detail?: string;
  pale?: string;
  // Other coats for a herd's beasts after the first, in turn, so a herd isn't all one colour.
  coats?: readonly string[];
  // How many: lumps, plants, logs, beasts.
  count: number;
};

const look = (
  shape: SpecialShape,
  colour: string,
  count: number,
  detail?: string,
  pale?: string,
  coats?: readonly string[]
): SpecialLook => ({
  shape,
  colour,
  count,
  ...(detail === undefined ? {} : { detail }),
  ...(pale === undefined ? {} : { pale }),
  ...(coats === undefined ? {} : { coats }),
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
  // Beasts. Horses are a bay, a chestnut and a grey, so a herd shows on the plains' tan, whatever the light.
  Horse: look('horse', '#6b4226', 3, '#241a12', '#e8e2d6', [
    '#9c5b2e',
    '#cfc9bd',
  ]),
  Buffalo: look('ox', '#4a3424', 3, '#2a1e16', '#d8ccb0'),
  Game: look('deer', '#a9835a', 2, '#5a4430', '#ece2cc'),
  // Caribou.
  'Tundra:Game': look('deer', '#7d6c56', 2, '#4a3e30', '#ece6da'),
  Furs: look('fox', '#b0602a', 2, '#2e2218', '#f0e8dc'),
  Ivory: look('elephant', '#8a8580', 1, '#77726d', '#f2ead8'),
  // Dark on the ice.
  Seal: look('seal', '#55585b', 2, '#3a3c3e', '#8a8d90'),
  Pheasant: look('bird', '#8a3a22', 3, '#2f5a3a', '#d8b040'),
  // In the sea.
  Fish: look('fish', '#b8c4cc', 5),
  Whales: look('whale', '#3a4048', 1),
  // The rest.
  Oil: look('derrick', '#222224', 1, '#121214'),
  Oasis: look('oasis', '#3f7a32', 3, '#3f86a8'),
  Peat: look('peat', '#4a3624', 4),
  Shield: look('logs', '#7a5532', 6, '#e2c690'),
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
