import i18next from 'i18next';

// Civilization II's difficulty level beyond Civilization's five (M2a, #1008).
i18next.addResources('en', 'difficulty', {
  'Deity.name': 'Deity',
});

// The rule sets Civilization II's difficulty registers (#158), by id with `:` and `/` as `.` (M2b, #1007).
i18next.addResources('en', 'ruleset', {
  'civ2-difficulty.combat-handicaps.name': 'Combat handicaps',
  'civ2-difficulty.combat-handicaps.description':
    'Below Prince, an attack on a human player’s unit is at half strength; on Chieftain, a human player’s attack is at double strength.',
});
