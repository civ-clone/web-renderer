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

// Civilization II's combat and its orders that Civilization has none of (M2b, #1007): hit points, firepower and fuel on
//  the unit card, the orders, what a unit is busy doing, and the mark drawn on an order's button that has no picture of
//  its own (#348).
i18next.addResources('en', 'unit', {
  'Yield.Firepower.name': 'Firepower',
  'Yield.Fuel.name': 'Fuel',
  'Yield.HitPoints.name': 'Hit points',

  'Action.Airlift.name': 'Airlift',
  'Action.BuildAirbase.name': 'Build airbase',
  'Action.BuildFortress.name': 'Build fortress',
  'Action.Paradrop.name': 'Paradrop',
  'Action.SabotageUnit.name': 'Sabotage unit',
  'Action.TransformTerrain.name': 'Transform terrain',

  'Action.Airlift.icon': 'AL',
  'Action.BuildAirbase.icon': 'E',
  'Action.Paradrop.icon': 'PD',
  'Action.TransformTerrain.icon': 'O',

  'Busy.BuildingAirbase.name': 'Building airbase',
  'Busy.BuildingFortress.name': 'Building fortress',
  'Busy.TransformingTerrain.name': 'Transforming terrain',

  'Busy.BuildingAirbase.icon': 'E',
  'Busy.BuildingFortress.icon': 'F',
  'Busy.TransformingTerrain.icon': 'O',
});

// The rule sets Civilization II's units register (#158), by id with `:` and `/` as `.`: as Civilization's do.
i18next.addResources('en', 'ruleset', {
  'civ2-unit.obsolescence.name': '$t(civ1-unit.obsolescence.name)',
  'civ2-unit.obsolescence.description':
    '$t(civ1-unit.obsolescence.description)',
});
