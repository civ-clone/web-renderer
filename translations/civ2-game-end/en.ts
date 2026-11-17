import i18next from 'i18next';

// Whether a destroyed civilization comes back under Civilization II's rules (M2e, #1008), the New Game setting
//  civ2-game-end registers, by id with `:` and `/` as `.`, in our own words.
i18next.addResources('en', 'ruleset', {
  'civ2-game-end.comebacks.name': 'Destroyed civilizations can return',
  'civ2-game-end.comebacks.description':
    'A computer civilization wiped out before the late game may rise again elsewhere, as a civilization not yet seen. Unticked, a civilization destroyed stays gone, and conquering the world early scores a little less.',
});
