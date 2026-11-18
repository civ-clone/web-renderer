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
  // #1076, #1077: the ages are Civilization II's four eras, named as civ1-enhanced's ages of the same name are
  //  (`Age.*` in `translations/civ1-enhanced/en.ts`), so they need no words of their own.
  'civ2-enhanced.ages.name':
    'Civilizations move through four ages as they learn',
  'civ2-enhanced.ages.description':
    'A civilization enters a new age, from the Ancient Age through the Renaissance and the Industrial Age to the Modern Age, with the first advance it learns from a later era, and you are told when yours does. The original sorts advances into these four eras only to choose their pictures.',
  'civ2-enhanced.research-cost-by-age.name':
    'Research costs rise with each age',
  'civ2-enhanced.research-cost-by-age.description':
    'Research costs half as much in the Ancient Age, rising with each age to about a sixth more in the Modern Age, so learning every advance costs about the same in total. Rushing ahead makes research dearer from then on, even for the advances you skipped. In the original, your age makes no difference to what research costs.',
});

// civ2-enhanced's barbarian and score rule sets (M2e, #1008), off to start with.
i18next.addResources('en', 'ruleset', {
  'civ2-enhanced.barbarian-uprisings.name':
    'Barbarian uprisings gather around the city they threaten, and you hear of one that fails',
  'civ2-enhanced.barbarian-uprisings.description':
    'In the original, an uprising’s site leans to the east, its size can come from a computer player’s city nearby, and one that finds nowhere to gather is dropped without a word.',
  'civ2-enhanced.barbarian-cities.name':
    'A barbarian city builds the fighters of its age',
  'civ2-enhanced.barbarian-cities.description':
    'In the original, a barbarian city starts on Legions, or Knights once anyone knows Explosives, however far the world has moved on.',
  'civ2-enhanced.pollution-score.name':
    'Each civilization’s score pays only for its own pollution',
  'civ2-enhanced.pollution-score.description':
    'In the original, every civilization loses the same points for all the pollution in the world, except what lies around computer players’ cities.',
});

// civ2-enhanced's spaceship rule set (M2e part 2, #1008), off to start with.
i18next.addResources('en', 'ruleset', {
  'civ2-enhanced.computer-launch-wait.name':
    'Above King, a computer player holds its spaceship back while a rival computer player’s ship would arrive first',
  'civ2-enhanced.computer-launch-wait.description':
    'In the original, a slip in the game compares their arrival with a ship that never flies, so no computer player ever waits.',
});
