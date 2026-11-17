import i18next from 'i18next';

// civ2-enhanced's rule sets as en-GB has them where they differ from en (M2d, #1007).
i18next.addResources('en-GB', 'ruleset', {
  'civ2-enhanced.attitude-drift.name':
    'A computer player’s feelings towards you change a little each turn, from where they are',
  'civ2-enhanced.attitude-drift.description':
    'In the original, a slip in the game resets them each turn, so every computer player you’ve met stays as cold towards you as it can be, except in a turn when your units are inside its borders.',
  'civ2-enhanced.pollution-score.name':
    'Each civilisation’s score pays only for its own pollution',
  'civ2-enhanced.pollution-score.description':
    'In the original, every civilisation loses the same points for all the pollution in the world, except what lies around computer players’ cities.',
  'civ2-enhanced.ages.name':
    'Civilisations move through four ages as they learn',
  'civ2-enhanced.ages.description':
    'A civilisation enters a new age, from the Ancient Age through the Renaissance and the Industrial Age to the Modern Age, with the first advance it learns from a later era, and you are told when yours does. The original sorts advances into these four eras only to choose their pictures.',
});
