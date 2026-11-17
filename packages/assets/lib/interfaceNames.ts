// The names the interface asks for its art by (#1063): civ.one's own, whichever tileset's interface art a theme draws
//  with (`interfaceArt`), which maps them to its own sprites where they differ (`names.ui`). They began as Civ1's, the
//  sprites under its descriptor's `assets.ui` prefixes, and keep Civ1's split between required and optional.

/** One name the interface asks for, and whether a set needs it to draw the interface (`required`). */
export interface InterfaceName {
  name: string;
  required: boolean;
}

/** What a set with interface art has to have: the yields, citizens, meters, cursors and textures. */
export const requiredInterfaceNames: readonly string[] = [
  'city/bulb',
  'city/food',
  'city/gold',
  'city/luxury',
  'city/people_content_f',
  'city/people_content_m',
  'city/people_happy_f',
  'city/people_happy_m',
  'city/people_luxury',
  'city/people_science',
  'city/people_tax',
  'city/people_unhappy_f',
  'city/people_unhappy_m',
  'city/pollution',
  'city/sad',
  'city/production',
  'city/trade',
  'cursor/go',
  'cursor/torch',
  'general/texture_1',
  'general/texture_2',
  'status/pollution_0',
  'status/pollution_25',
  'status/pollution_50',
  'status/pollution_75',
  'status/science_0',
  'status/science_25',
  'status/science_50',
  'status/science_75',
];

/**
 * What it may leave out: the women specialists, which fall back to the men, and the improvements' and Wonders'
 *  pictures, which the city screen goes without.
 */
export const optionalInterfaceNames: readonly string[] = [
  'city/people_tax_f',
  'city/people_science_f',
  'city/people_luxury_f',
  'city-improvements/palace',
  'city-improvements/barracks',
  'city-improvements/granary',
  'city-improvements/temple',
  'city-improvements/marketplace',
  'city-improvements/library',
  'city-improvements/courthouse',
  'city-improvements/citywalls',
  'city-improvements/aqueduct',
  'city-improvements/bank',
  'city-improvements/cathedral',
  'city-improvements/university',
  'city-improvements/masstransit',
  'city-improvements/colosseum',
  'city-improvements/factory',
  'city-improvements/manufacturingplant',
  'city-improvements/sdidefence',
  'city-improvements/recyclingcenter',
  'city-improvements/powerplant',
  'city-improvements/hydroplant',
  'city-improvements/nuclearplant',
  'wonders/pyramids',
  'wonders/hanginggardens',
  'wonders/colossus',
  'wonders/lighthouse',
  'wonders/greatlibrary',
  'wonders/oracle',
  'wonders/greatwall',
  'wonders/magellansexpedition',
  'wonders/michelangeloschapel',
  'wonders/copernicusobservatory',
  'wonders/shakespearestheatre',
  'wonders/isaacnewtonscollege',
  'wonders/jsbachscathedral',
  'wonders/darwinsvoyage',
  'wonders/hooverdam',
  'wonders/womenssuffrage',
  'wonders/manhattanproject',
  'wonders/unitednations',
  'wonders/apolloprogram',
  'wonders/setiprogram',
  'wonders/cureforcancer',
];

/** Every name the interface asks for, each marked required or optional. */
export const interfaceNames: readonly InterfaceName[] = [
  ...requiredInterfaceNames.map((name) => ({ name, required: true })),
  ...optionalInterfaceNames.map((name) => ({ name, required: false })),
];

export default interfaceNames;
