// The built-in set's units (docs/3d-renderer.md §6.1, §10, plan 2.1): what each unit type is drawn as, until a hosted
//  set brings models of its own (D3). Made by code, by the 3D map's generators: a figure on foot or mounted, siege
//  engines, vehicles, ships and aircraft, each in its era's kit, and how many figures stand for a unit (D6).
//
// Keyed by the engine's names for unit types, Civ1's and Civ2's, as the client gets them (`unit._`). A type the table
//  doesn't know is drawn by its kind, which the engine sends too (`unit.__`): a ship, an aircraft, or a figure on foot.
//  This is art, not rules: it says nothing of what a unit can do.

/** What a unit is drawn as. */
export type UnitShape =
  // People on foot, with what they carry.
  | 'foot'
  // A rider on a horse, or on an elephant.
  | 'mounted'
  | 'elephant'
  // A catapult, a cannon on wheels, or a tracked or wheeled gun.
  | 'siege'
  // A tank, a troop carrier, a truck.
  | 'vehicle'
  // A cart and its oxen: settlers, caravans and freight.
  | 'cart'
  | 'ship'
  | 'aircraft'
  | 'helicopter'
  | 'missile';

/** How old a unit's kit is: its weapons, armour, hulls and engines. */
export type UnitEra =
  | 'ancient'
  | 'medieval'
  | 'renaissance'
  | 'industrial'
  | 'modern';

/** What a figure on foot or mounted carries: a diplomat's case, and an explorer's pack and staff, among them. */
export type UnitGear =
  | 'club'
  | 'spear'
  | 'sword'
  | 'bow'
  | 'pike'
  | 'lance'
  | 'musket'
  | 'rifle'
  | 'case'
  | 'pack'
  | 'none';

/** How a figure on foot is dressed, where it isn't its era's uniform: for snow, as irregulars, or with a parachute. */
export type UnitDress = 'snow' | 'irregular' | 'parachute';

/** What a cart is: settlers' covered wagon, a caravan's goods, or a war chariot. */
export type CartKind = 'wagon' | 'goods' | 'chariot';

/** What ships look like: oars, sails, funnels, a flat deck, or under the water. */
export type HullKind = 'oars' | 'sail' | 'steam' | 'carrier' | 'submarine';

export type UnitLook = {
  shape: UnitShape;
  era: UnitEra;
  // For figures.
  gear?: UnitGear;
  dress?: UnitDress;
  // For carts.
  cart?: CartKind;
  // For ships: the hull, and the guns on it (turrets on a steel hull, a row of ports on a sailing ship), or missiles.
  hull?: HullKind;
  guns?: number;
  missiles?: boolean;
  // For aircraft: dark and flat, made not to be seen.
  stealth?: boolean;
  // How many figures stand for one unit (D6): a squad for soldiers, one for most else.
  squad: number;
  // Bigger than its shape's usual: a battleship, a bomber, a howitzer.
  large?: boolean;
};

const foot = (era: UnitEra, gear: UnitGear, squad: number = 3): UnitLook => ({
    shape: 'foot',
    era,
    gear,
    squad,
  }),
  mounted = (era: UnitEra, gear: UnitGear, squad: number = 2): UnitLook => ({
    shape: 'mounted',
    era,
    gear,
    squad,
  }),
  ship = (
    era: UnitEra,
    hull: HullKind,
    large = false,
    guns = 0,
    missiles = false
  ): UnitLook => ({
    shape: 'ship',
    era,
    hull,
    squad: 1,
    large,
    guns,
    missiles,
  }),
  aircraft = (era: UnitEra, large = false, stealth = false): UnitLook => ({
    shape: 'aircraft',
    era,
    squad: 1,
    large,
    stealth,
  }),
  cart = (era: UnitEra, kind: CartKind): UnitLook => ({
    shape: 'cart',
    era,
    cart: kind,
    squad: 1,
  });

export const unitTable: { readonly [type: string]: UnitLook } = {
  // Ancient.
  Warrior: foot('ancient', 'club'),
  Spearman: foot('ancient', 'spear'),
  Swordman: foot('ancient', 'sword'),
  Archer: foot('ancient', 'bow'),
  Horseman: mounted('ancient', 'spear'),
  Chariot: cart('ancient', 'chariot'),
  Elephant: { shape: 'elephant', era: 'ancient', squad: 1 },
  Catapult: { shape: 'siege', era: 'ancient', squad: 1 },
  Trireme: ship('ancient', 'oars'),
  Settlers: cart('ancient', 'wagon'),
  Diplomat: foot('ancient', 'case', 1),
  Caravan: cart('ancient', 'goods'),
  Explorer: foot('ancient', 'pack', 1),
  // Medieval.
  Pikeman: foot('medieval', 'pike'),
  Knight: mounted('medieval', 'lance'),
  Crusader: mounted('medieval', 'sword'),
  Fanatic: foot('medieval', 'sword'),
  Sail: ship('medieval', 'sail'),
  // Renaissance.
  Musketman: foot('renaissance', 'musket'),
  Dragoon: mounted('renaissance', 'musket'),
  Cannon: { shape: 'siege', era: 'renaissance', squad: 1 },
  Frigate: ship('renaissance', 'sail', true, 1),
  Galleon: ship('renaissance', 'sail', true),
  // Industrial.
  Rifleman: foot('industrial', 'rifle'),
  AlpineTrooper: { ...foot('industrial', 'rifle'), dress: 'snow' },
  Partisan: { ...foot('industrial', 'rifle'), dress: 'irregular' },
  Cavalry: mounted('industrial', 'rifle'),
  Artillery: { shape: 'siege', era: 'industrial', squad: 1 },
  Engineer: foot('industrial', 'none', 2),
  Ironclad: ship('industrial', 'steam', false, 1),
  Transport: ship('industrial', 'steam', true),
  Freight: { shape: 'vehicle', era: 'industrial', squad: 1 },
  Spy: foot('industrial', 'none', 1),
  // Modern.
  MechanizedInfantry: { shape: 'vehicle', era: 'modern', squad: 1 },
  Marine: foot('modern', 'rifle'),
  // One, not a squad (D6): a model draws a parachutist under his canopy, and three canopies would cut through each
  //  other. The built-in figure, with only his pack, is one too, to look the same whichever draws him.
  Paratrooper: { ...foot('modern', 'rifle', 1), dress: 'parachute' },
  Tank: { shape: 'vehicle', era: 'modern', squad: 1, large: true },
  Howitzer: { shape: 'siege', era: 'modern', squad: 1, large: true },
  Destroyer: ship('modern', 'steam', false, 1),
  Cruiser: ship('modern', 'steam', true, 2),
  MissileCruiser: ship('modern', 'steam', true, 1, true),
  Battleship: ship('modern', 'steam', true, 3),
  Submarine: ship('modern', 'submarine'),
  Carrier: ship('modern', 'carrier', true),
  Fighter: aircraft('modern'),
  StealthFighter: aircraft('modern', false, true),
  Bomber: aircraft('modern', true),
  StealthBomber: aircraft('modern', true, true),
  Helicopter: { shape: 'helicopter', era: 'modern', squad: 1 },
  CruiseMissile: { shape: 'missile', era: 'modern', squad: 1 },
  Nuclear: { shape: 'missile', era: 'modern', squad: 1, large: true },
};

/**
 * What a unit of `type` is drawn as: the table's entry, or for a type it doesn't know, by its kind, as the engine's
 *  class names (`unit.__`) say: a ship, an aircraft, or soldiers on foot.
 */
export const unitLook = (
  type: string,
  kinds: readonly string[] = []
): UnitLook =>
  (Object.prototype.hasOwnProperty.call(unitTable, type)
    ? unitTable[type]
    : undefined) ??
  (kinds.includes('Naval') || kinds.includes('NavalTransport')
    ? ship('industrial', 'steam')
    : kinds.includes('Air')
    ? aircraft('modern')
    : foot('ancient', 'spear'));

/** Whether a unit that looks like `look` is drawn in the air, flying as it moves: aircraft, helicopters and missiles. */
export const airborne = (look: UnitLook): boolean =>
  look.shape === 'aircraft' ||
  look.shape === 'helicopter' ||
  look.shape === 'missile';

export default unitTable;
