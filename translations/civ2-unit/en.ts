import i18next from 'i18next';

// Civilization II's units that Civilization has none of (M2a, #1008), by their class names: the engine's own, so a few
//  are not quite Civilization II's (an Alpine Trooper, a Missile Cruiser).
i18next.addResources('en', 'unit', {
  'AlpineTrooper.name': 'Alpine Trooper',
  'Archer.name': 'Archer',
  'Cavalry.name': 'Cavalry',
  'CruiseMissile.name': 'Cruise Missile',
  'Crusader.name': 'Crusader',
  'Destroyer.name': 'Destroyer',
  'Dragoon.name': 'Dragoon',
  'Elephant.name': 'Elephant',
  'Engineer.name': 'Engineer',
  'Explorer.name': 'Explorer',
  'Fanatic.name': 'Fanatic',
  'Freight.name': 'Freight',
  'Galleon.name': 'Galleon',
  'Helicopter.name': 'Helicopter',
  'Howitzer.name': 'Howitzer',
  'Marine.name': 'Marine',
  'MissileCruiser.name': 'Missile Cruiser',
  'Paratrooper.name': 'Paratrooper',
  'Partisan.name': 'Partisan',
  'Pikeman.name': 'Pikeman',
  'Spy.name': 'Spy',
  'StealthBomber.name': 'Stealth Bomber',
  'StealthFighter.name': 'Stealth Fighter',
});

// The rule sets Civilization II's units register (#158), by id with `:` and `/` as `.`: as Civilization's do.
i18next.addResources('en', 'ruleset', {
  'civ2-unit.obsolescence.name': '$t(civ1-unit.obsolescence.name)',
  'civ2-unit.obsolescence.description':
    '$t(civ1-unit.obsolescence.description)',
});
