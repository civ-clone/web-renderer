import i18next from 'i18next';

// The rule sets of the rules where this game plays differently from the original (#954), by id with `:` and `/` as
//  `.`. Each name says what happens with its box ticked, and its description what the original game does instead: the
//  original rules each one replaces are drawn nowhere, so this is all the player is told.
i18next.addResources('en', 'ruleset', {
  'civ1-enhanced.name': 'Enhanced rules',
  'civ1-enhanced.description':
    'Rules where this game can play differently from the original Civilization. One left unticked plays as the original did.',
  'civ1-enhanced.hydro-plant-site.name':
    'A city that stands on a River or Mountains can also build a Hydro Plant',
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
  'civ1-enhanced.captured-city-build.name':
    'A city you capture stops building what it was, and you choose again',
  'civ1-enhanced.captured-city-build.description':
    'In the original, you go on building what it was, from no shields and at your price, even something you couldn’t otherwise build. A computer player that captures a city chooses again either way. While “A city stops building what a discovery makes obsolete” is ticked, a kept item you couldn’t otherwise build is dropped at your next discovery.',
  'civ1-enhanced.pollution-in-every-city.name':
    'Every civilization’s cities can cause pollution',
  'civ1-enhanced.pollution-in-every-city.description':
    'In the original, only yours can: computer players’ cities never pollute.',
  'civ1-enhanced.barbarian-city-builds.name':
    'Barbarian cities build any attacking land unit that at least two civilizations can build',
  'civ1-enhanced.barbarian-city-builds.description':
    'In the original, they build only one unit: a Swordman, or a Knight once anyone has discovered Explosives, and a Warrior when the Barbarians have no units left.',
  'civ1-enhanced.barbarian-uprisings.name':
    'Barbarian uprisings can break out near any civilization’s cities',
  'civ1-enhanced.barbarian-uprisings.description':
    'In the original, only near yours.',
});
