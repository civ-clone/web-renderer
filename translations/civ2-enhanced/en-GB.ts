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
    'In the original, every civilisation loses the same points for all the pollution in the world, less half of what lies near computer players’ cities.',
});
