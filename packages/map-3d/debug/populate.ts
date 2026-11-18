// The debug page's made-up cities and units (docs/3d-renderer-plan.md 1.1b, 1.3): a few civilizations' cities on its
//  land, and stacks of units about them, for the 3D map's markers to be seen without a game. Seeded, as the world is.

import { Tile } from '@civ-clone/ui-protocol/types';

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

const unitTypes = [
  'Settlers',
  'Warriors',
  'Phalanx',
  'Archers',
  'Legion',
  'Horsemen',
  'Catapult',
  'Musketeers',
];

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
export const populate = (tiles: Tile[], seed: number): void => {
  const players = civilizations.map(({ colours }, index) => ({
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
    })),
    named = civilizations.map(() => 0);

  tiles.forEach((tile) => {
    if (!tile.isLand) {
      return;
    }

    const { x, y } = tile,
      owner = Math.floor(chance(x, y, seed, 1) * players.length),
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
        unitTypes[
          Math.floor(chance(x, y, seed, 10 + index) * unitTypes.length)
        ]!;

      return {
        _: type,
        id: `Unit-${x}-${y}-${index}`,
        player,
        defence: { value: 1 + Math.floor(chance(x, y, seed, 20 + index) * 3) },
        busy: chance(x, y, seed, 30 + index) < 0.3 ? { _: 'Fortified' } : null,
        tile,
      } as unknown as Tile['units'][number];
    });
  });
};

export default populate;
