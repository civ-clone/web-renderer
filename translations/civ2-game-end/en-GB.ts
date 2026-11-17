import i18next from 'i18next';

// The returning civilizations setting (M2e), as en-GB has it where it differs from en.
i18next.addResources('en-GB', 'ruleset', {
  'civ2-game-end.comebacks.name': 'Destroyed civilisations can return',
  'civ2-game-end.comebacks.description':
    'A computer civilisation wiped out before the late game may rise again elsewhere, as a civilisation not yet seen. Unticked, a civilisation destroyed stays gone, and conquering the world early scores a little less.',
});
