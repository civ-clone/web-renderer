import i18next from 'i18next';

// The rule sets of the rules where this game plays differently from the original (#954), by id with `:` and `/` as
//  `.`. Each name says what happens with its box ticked, and its description what the original game does instead: the
//  original rules each one replaces are drawn nowhere, so this is all the player is told.
i18next.addResources('en', 'ruleset', {
  'civ1-enhanced.name': 'Enhanced rules',
  'civ1-enhanced.description':
    'Rules where this game can play differently from the original Civilization. One left unticked plays as the original did.',
  'civ1-enhanced.hydro-plant-site.name':
    'A city on a River or Mountains can build a Hydro Plant',
  'civ1-enhanced.hydro-plant-site.description':
    'In the original, only the eight squares around the city count, not the square it stands on.',
  'civ1-enhanced.barbarian-leader-ransom.name':
    'A Barbarian leader killed with his escort pays his ransom',
  'civ1-enhanced.barbarian-leader-ransom.description':
    'In the original, he pays only when he is the unit that defends and loses.',
  'civ1-enhanced.obsolete-builds.name':
    'A city stops building what a discovery makes obsolete',
  'civ1-enhanced.obsolete-builds.description':
    'You choose what it builds instead. In the original, the city goes on and finishes it.',
});
