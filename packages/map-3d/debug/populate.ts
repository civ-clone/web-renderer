// The debug page's made-up cities and units (docs/3d-renderer-plan.md 1.1b, 1.3, 2.1): a few civilizations' cities on
//  its land, stacks of units of every era about them, and ships at sea, some fortified, veterans or hurt, for the 3D
//  map's markers to be seen without a game. Seeded, as the world is. Units' types are the engine's names for them.

import { Tile } from '@civ-clone/ui-protocol/types';
import { unitTable } from '@civ-clone/ui-models-builtin/units';

// Civ1's colours for a few civilizations, as the engine sends them (`colors`), and some of their cities' names.
const civilizations = [
  {
    colours: ['#ffffff', '#555555'],
    names: ['Roma', 'Caesarea', 'Neapolis', 'Ravenna', 'Antium', 'Capua'],
  },
  {
    colours: ['#dc3d3d', '#ffffff'],
    names: ['Babylon', 'Ur', 'Nineveh', 'Lagash', 'Nippur', 'Akkad'],
  },
  {
    colours: ['#3d64dc', '#ffffff'],
    names: ['Berlin', 'Leipzig', 'Hamburg', 'Bremen', 'Frankfurt', 'Bonn'],
  },
  {
    colours: ['#e0d33a', '#3a3a3a'],
    names: ['Athens', 'Sparta', 'Corinth', 'Delphi', 'Argos', 'Thebes'],
  },
];

/** The land and air units the page puts on land, and the ships it puts at sea, by the engine's names. */
export const landTypes = [
    'Settlers',
    'Warrior',
    'Spearman',
    'Archer',
    'Swordman',
    'Horseman',
    'Chariot',
    'Elephant',
    'Catapult',
    'Knight',
    'Pikeman',
    'Crusader',
    'Musketman',
    'Cannon',
    'Caravan',
    'Rifleman',
    'Cavalry',
    'Artillery',
    'Engineer',
    'Tank',
    'MechanizedInfantry',
    'Fighter',
    'Bomber',
    'Helicopter',
  ],
  seaTypes = [
    'Trireme',
    'Sail',
    'Frigate',
    'Galleon',
    'Ironclad',
    'Transport',
    'Destroyer',
    'Cruiser',
    'Battleship',
    'Carrier',
    'Submarine',
  ];

// The kinds the engine says these are of, as the 3D map draws a type it doesn't know by them.
const kindsOf = (type: string): string[] =>
  unitTable[type]?.shape === 'ship'
    ? ['Naval', 'Unit']
    : ['aircraft', 'helicopter', 'missile'].includes(
        unitTable[type]?.shape ?? ''
      )
    ? ['Air', 'Unit']
    : ['Land', 'Unit'];

// A square's own fraction from 0 to 1, from its co-ordinates, the seed and what it's for.
const chance = (x: number, y: number, seed: number, salt: number): number => {
  let h =
    (Math.imul(x, 374761393) +
      Math.imul(y, 668265263) +
      Math.imul(seed, 2246822519) +
      Math.imul(salt, 3266489917)) |
    0;

  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;

  return (h >>> 0) / 4294967296;
};

/** Puts cities and units on some of `tiles`' land, from `seed`: only on squares that have been seen. */
// The civilizations' players, as the client gets them: only what the 3D map reads.
const playersOf = () =>
  civilizations.map(({ colours }, index) => ({
    _: 'Player',
    __: ['Player'],
    id: `Player-${index}`,
    civilization: {
      _: 'Civilization',
      __: ['Civilization'],
      id: `Civilization-${index}`,
      attributes: [
        {
          _: 'Attribute',
          __: [],
          id: `colors-${index}`,
          name: 'colors',
          value: colours,
        },
      ],
    },
  }));

export const populate = (tiles: Tile[], seed: number): void => {
  const players = playersOf(),
    named = civilizations.map(() => 0);

  tiles.forEach((tile) => {
    const { x, y } = tile;

    // A ship now and then at sea.
    if (!tile.isLand) {
      if (chance(x, y, seed, 40) < 0.012) {
        const player =
            players[Math.floor(chance(x, y, seed, 1) * players.length)]!,
          type =
            seaTypes[Math.floor(chance(x, y, seed, 41) * seaTypes.length)]!;

        tile.units = [
          {
            _: type,
            __: kindsOf(type),
            id: `Unit-${x}-${y}-0`,
            player,
            defence: { value: 1 },
            busy: null,
            improvements: [],
            tile,
          } as unknown as Tile['units'][number],
        ];
      }

      return;
    }

    const owner = Math.floor(chance(x, y, seed, 1) * players.length),
      player = players[owner]!,
      names = civilizations[owner]!.names;

    if (chance(x, y, seed, 2) < 0.025 && (named[owner] ?? 0) < names.length) {
      const name = names[named[owner]!]!;

      named[owner] = (named[owner] ?? 0) + 1;
      tile.city = {
        _: 'City',
        id: `City-${x}-${y}`,
        name,
        player,
        growth: { size: 1 + Math.floor(chance(x, y, seed, 3) * 12) },
        walled: chance(x, y, seed, 4) < 0.4,
        civilDisorderDeclared: chance(x, y, seed, 5) < 0.1,
        tile,
      } as unknown as Tile['city'];
    }

    const count =
      chance(x, y, seed, 6) < (tile.city ? 0.8 : 0.05)
        ? 1 + Math.floor(chance(x, y, seed, 7) * 4)
        : 0;

    tile.units = Array.from({ length: count }, (_, index) => {
      const type =
          landTypes[
            Math.floor(chance(x, y, seed, 10 + index) * landTypes.length)
          ]!,
        fortified = chance(x, y, seed, 30 + index) < 0.3,
        veteran = chance(x, y, seed, 50 + index) < 0.3,
        hurt = chance(x, y, seed, 60 + index) < 0.25;

      return {
        _: type,
        __: kindsOf(type),
        id: `Unit-${x}-${y}-${index}`,
        player,
        defence: { value: 1 + Math.floor(chance(x, y, seed, 20 + index) * 3) },
        busy: fortified ? { _: 'Fortified' } : null,
        improvements: [
          ...(fortified ? [{ _: 'Fortified' }] : []),
          ...(veteran ? [{ _: 'Veteran' }] : []),
        ],
        hitPoints: hurt
          ? {
              current: 1 + Math.floor(chance(x, y, seed, 70 + index) * 9),
              max: 10,
            }
          : null,
        tile,
      } as unknown as Tile['units'][number];
    });
  });
};

/**
 * The page's gallery (`?gallery=1`): every unit type the built-in set names, one to a square, the nearest squares to
 *  (`x`, `y`) first, ships at sea and the rest on land, in each civilization's colours in turn, some fortified, veterans
 *  or hurt. No cities.
 */
export const gallery = (tiles: Tile[], x: number, y: number): void => {
  const players = playersOf(),
    nearest = (water: boolean): Tile[] =>
      tiles
        // Squares never seen are neither.
        .filter((tile) =>
          water ? !tile.isLand && tile.terrain._ !== 'Unknown' : tile.isLand
        )
        .sort(
          (a, b) =>
            Math.abs(a.x - x) +
              Math.abs(a.y - y) -
              (Math.abs(b.x - x) + Math.abs(b.y - y)) ||
            a.y - b.y ||
            a.x - b.x
        ),
    land = nearest(false),
    sea = nearest(true),
    types = Object.keys(unitTable),
    ships = types.filter((type) => unitTable[type]!.shape === 'ship'),
    others = types.filter((type) => unitTable[type]!.shape !== 'ship');

  tiles.forEach((tile) => {
    tile.city = null;
    tile.units = [];
  });

  [
    [others, land],
    [ships, sea],
  ].forEach(([names, squares]) =>
    (names as string[]).forEach((type, index) => {
      const tile = (squares as Tile[])[index];

      if (tile === undefined) {
        return;
      }

      const fortified = index % 4 === 1 && unitTable[type]!.shape !== 'ship';

      tile.units = [
        {
          _: type,
          __: kindsOf(type),
          id: `Unit-${tile.x}-${tile.y}-0`,
          player: players[index % players.length],
          defence: { value: 1 },
          busy: fortified ? { _: 'Fortified' } : null,
          improvements: [
            ...(fortified ? [{ _: 'Fortified' }] : []),
            ...(index % 3 === 2 ? [{ _: 'Veteran' }] : []),
          ],
          hitPoints: index % 5 === 3 ? { current: 4, max: 10 } : null,
          tile,
        } as unknown as Tile['units'][number],
      ];
    })
  );
};

export default populate;
