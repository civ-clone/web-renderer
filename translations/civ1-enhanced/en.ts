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
    'In the original, you go on building what it was, from no shields and at your price, even something you couldn’t otherwise build. A computer player that captures a city chooses again either way. While “A city stops building what a discovery makes obsolete” is ticked, a kept item you couldn’t otherwise build is dropped as soon as you gain an advance that still doesn’t let you build it, which may be the one you take with the city.',
  'civ1-enhanced.pollution-in-every-city.name':
    'Every civilization’s cities can cause pollution',
  'civ1-enhanced.pollution-in-every-city.description':
    'In the original, only yours can: computer players’ cities never pollute.',
  'civ1-enhanced.barbarian-city-builds.name':
    'Barbarian cities build any attacking land unit that at least two civilizations can build',
  'civ1-enhanced.barbarian-city-builds.description':
    'In the original, they build only one unit: a Swordman, or a Knight once anyone has discovered Explosives, and a Warrior when the Barbarians have no units left.',
  'civ1-enhanced.barbarian-uprisings.name':
    'Any civilization’s cities can set off a Barbarian uprising',
  'civ1-enhanced.barbarian-uprisings.description':
    'In the original, only your cities can.',
  'civ1-enhanced.settlers-wait-for-size-two.name':
    'A city of size 1 waits until it is size 2 to complete Settlers',
  'civ1-enhanced.settlers-wait-for-size-two.description':
    'In the original, the city only waits on Chieftain. On other levels your only city builds them and stays at size 1, and any other city is given up, leaving the Settlers on its square.',
  'civ1-enhanced.united-nations-stops-computer-wars.name':
    'The United Nations stops computer players going to war with its owner',
  'civ1-enhanced.united-nations-stops-computer-wars.description':
    'In the original, it only stops computer players going to war with you, not with a computer player that owns it.',
  'civ1-enhanced.even-advance-stealing.name':
    'Every advance a Diplomat could steal is equally likely',
  'civ1-enhanced.even-advance-stealing.description':
    'In the original, a Diplomat takes the first advance it can from a random place in the list of advances, so some are likelier than others.',
  'civ1-enhanced.sdi-defense-spares-cities.name':
    'SDI Defense spares its city from a nuclear attack',
  'civ1-enhanced.sdi-defense-spares-cities.description':
    'In the original, SDI Defense only saves the units inside, and the city is still halved.',
  'civ1-enhanced.defectors-stay-veteran.name':
    'Bribed and defecting units stay veteran',
  'civ1-enhanced.defectors-stay-veteran.description':
    'In the original, a unit that changes sides arrives as a new unit and is no longer a veteran.',
});

// What a build this package's rule holds back says (#959), in the client's words for a held build (`City.Build.Held.*`
//  in `packages/client/translations`), keyed by the rule's id with `:` and `/` as `.`.
i18next.addResources('en', 'default', {
  'City.Build.Held.waiting.civ1-enhanced.city.hold.settlers-until-size-two':
    'Waiting until the city is size 2',
  'City.Build.Held.cannot-complete.civ1-enhanced.city.hold.settlers-until-size-two':
    'Can’t be completed until the city is size 2',
  'City.Build.Held.purchase.civ1-enhanced.city.hold.settlers-until-size-two':
    '{{- item}} can’t be completed until the city is size 2.',
});
