import i18next from 'i18next';

// The rule sets of the rules where Civilization II games can play differently from the original (M2d, #1007), by id
//  with `:` and `/` as `.`, as civ1-enhanced's are: each name says what happens with its box ticked, and its description
//  what the original game does instead.
i18next.addResources('en', 'ruleset', {
  'civ2-enhanced.name': 'Enhanced rules',
  'civ2-enhanced.description':
    'Rules where this game can play differently from the original Civilization II. One left unticked plays as the original did.',
  'civ2-enhanced.attitude-drift.name':
    'A computer player’s feelings toward you change a little each turn, from where they are',
  'civ2-enhanced.attitude-drift.description':
    'In the original, a slip in the game resets them each turn, so every computer player you’ve met stays as cold toward you as it can be, except in a turn when your units are inside its borders.',
  'civ2-enhanced.border-intruders.name':
    'Every square near a computer player’s city that your units stand on counts against you',
  'civ2-enhanced.border-intruders.description':
    'In the original, only the first such square near each city counts.',
  'civ2-enhanced.treaty-breaking.name':
    'A computer player that breaks a treaty with you tells you so',
  'civ2-enhanced.treaty-breaking.description':
    'In the original, it breaks the treaty without a word.',
  'civ2-enhanced.fixed-research-costs.name':
    'Each advance has a fixed research cost',
  'civ2-enhanced.fixed-research-costs.description':
    'An advance costs more the more advances it needs, whichever others you have learnt, so racing ahead no longer makes later advances cheaper. Learning every advance costs about the same in total. In the original, each advance costs more for every advance you already know.',
});
