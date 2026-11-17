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
  'Action.BuildFarmland.name': 'Build farmland',
  'Action.BuildFortress.name': 'Build fortress',
  'Action.Paradrop.name': 'Paradrop',
  'Action.SabotageUnit.name': 'Sabotage unit',
  'Action.TransformTerrain.name': 'Transform terrain',
  // M2d (#1007): a unit repaired in an ally's city, which it can't otherwise enter, and an attack on a player you've met
  //  and aren't at war with, which the Senate may stop (offered only in its place, as `Overruled`'s).
  'Action.AlliedRepair.name': 'Repair in an ally’s city',
  'Action.UndeclaredAttack.name': 'Attack',
  'Action.UndeclaredNuclearAttack.name': 'Nuclear attack',
  // M2d part 2 (#1007): a Spy's missions, and those under a treaty, which are confirmed first.
  'Action.PlantNuclearDevice.name': 'Plant a nuclear device',
  'Action.PoisonWater.name': 'Poison the water supply',
  'Action.SneakIndustrialSabotage.name': 'Industrial sabotage',
  'Action.SneakPoisonWater.name': 'Poison the water supply',

  'Action.Airlift.icon': 'AL',
  'Action.BuildAirbase.icon': 'E',
  'Action.BuildFarmland.icon': 'I',
  'Action.Paradrop.icon': 'PD',
  'Action.TransformTerrain.icon': 'O',

  'Busy.BuildingAirbase.name': 'Building airbase',
  'Busy.BuildingFarmland.name': 'Building farmland',
  'Busy.BuildingFortress.name': 'Building fortress',
  'Busy.TransformingTerrain.name': 'Transforming terrain',

  'Busy.BuildingAirbase.icon': 'E',
  'Busy.BuildingFarmland.icon': 'I',
  'Busy.BuildingFortress.icon': 'F',
  'Busy.TransformingTerrain.icon': 'O',
});

// The rule sets Civilization II's units register (#158), by id with `:` and `/` as `.`: as Civilization's do.
i18next.addResources('en', 'ruleset', {
  'civ2-unit.obsolescence.name': '$t(civ1-unit.obsolescence.name)',
  'civ2-unit.obsolescence.description':
    '$t(civ1-unit.obsolescence.description)',
});

// What a person is told of Diplomats and Spies under Civilization II's rules (M2d part 2, #1007), by `ui-rules-civ2`'s
//  notices. A civilization not yet met is `.unmet`, and not named (#59).
const the = (path: string): string =>
    `the $t(Generic.civilization-name.plural, { "civilization": "{{${path}.civilization._}}", "ns": "default" })`,
  The = (path: string): string =>
    `The $t(Generic.civilization-name.plural, { "civilization": "{{${path}.civilization._}}", "ns": "default" })`,
  unit = '$t({{unit._}}.name, { "defaultValue": "{{unit._}}", "ns": "unit" })';

i18next.addResources('en', 'notification', {
  'Espionage.water-poisoned-by-us.title': 'Water poisoned',
  'Espionage.water-poisoned-by-us.body':
    'Our Spy has poisoned the water supply of {{- city, cityName}}.',
  'Espionage.water-poisoned.title': 'Water poisoned!',
  'Espionage.water-poisoned.body': `${The(
    'player'
  )} have poisoned the water supply of {{- city, cityName}}, and its people sicken.`,
  'Espionage.water-poisoned.unmet.title': 'Water poisoned!',
  'Espionage.water-poisoned.unmet.body':
    'Someone has poisoned the water supply of {{- city, cityName}}, and its people sicken.',
  'Espionage.agent-caught.title': 'Agent caught',
  'Espionage.agent-caught.body': `Our ${unit} was caught in {{- city, cityName}}.`,
  'Espionage.agent-caught-at-unit.title': 'Agent caught',
  'Espionage.agent-caught-at-unit.body': `Our ${unit} was caught before it could act.`,
  'Espionage.agent-lost.title': 'Agent lost',
  'Espionage.agent-lost.body': `Our ${unit} did not make it back from {{- city, cityName}}.`,
  'Espionage.agent-lost-at-unit.title': 'Agent lost',
  'Espionage.agent-lost-at-unit.body': `Our ${unit} did not make it back from its mission.`,
  'Espionage.device-detonated.title': 'Nuclear attack!',
  'Espionage.device-detonated.body':
    'A nuclear device planted by a Spy has gone off. Who sent the Spy is not known.',
  'Espionage.foreign-agent-caught.title': 'Agent caught',
  'Espionage.foreign-agent-caught.body': `Our guards have caught a ${unit} sent by ${the(
    'player'
  )} in {{- city, cityName}}.`,
  'Espionage.foreign-agent-caught.unmet.title': 'Agent caught',
  'Espionage.foreign-agent-caught.unmet.body': `Our guards have caught a ${unit} in {{- city, cityName}}. Who sent it, we cannot say.`,
  'Espionage.device-planted.title': 'Nuclear device',
  'Espionage.device-planted.body':
    'The nuclear device our Spy planted has gone off in {{- city, cityName}}.',
  'Espionage.device-discovered-ours.title': 'Plot uncovered!',
  'Espionage.device-discovered-ours.body':
    'The world has learned that our Spy planted a nuclear device. Every civilization in contact with us has declared war on us.',
  'Espionage.device-discovered.title': 'Plot uncovered!',
  'Espionage.device-discovered.body': `${The(
    'player'
  )} were behind a nuclear device set off by a Spy. We are now at war with them.`,
  'Espionage.device-discovered.unmet.title': 'Plot uncovered!',
  'Espionage.device-discovered.unmet.body':
    'A civilization we have not met was behind a nuclear device set off by a Spy.',
});
