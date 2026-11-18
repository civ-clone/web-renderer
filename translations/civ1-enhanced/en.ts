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
    'A city stops building what it can no longer build',
  'civ1-enhanced.obsolete-builds.description':
    'You choose again when a discovery makes the item obsolete, when the city loses an improvement the item needs, or when you gain the Hoover Dam and the item is a power plant it rules out on its continent. In the original, the city goes on and finishes it.',
  'civ1-enhanced.captured-city-build.name':
    'A city you capture stops building what it was, and you choose again',
  'civ1-enhanced.captured-city-build.description':
    'In the original, you go on building what it was, from no shields and at your price, even something you couldn’t otherwise build. A computer player that captures a city chooses again either way.',
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
  'civ1-enhanced.fixed-research-costs.name':
    'Each advance has a fixed research cost',
  'civ1-enhanced.fixed-research-costs.description':
    'An advance costs more the more advances it needs, however many others you know, so racing to The Republic costs what learning steadily does. Learning every advance costs the same in total. In the original, each advance costs more for every advance you already know.',
  'civ1-enhanced.ages.name':
    'Civilizations move through eight ages as they learn',
  'civ1-enhanced.ages.description':
    'A civilization enters a new age, from the Ancient Age to the Space Age, with the first advance it learns from a later research tier, and you are told when yours does. The original has no ages.',
  'civ1-enhanced.research-cost-by-age.name':
    'Research costs rise with each age, not from 1 AD',
  'civ1-enhanced.research-cost-by-age.description':
    'Research costs half as much in the Ancient Age, rising with each age to three times in the Space Age, and a civilization’s costs rise once it is in the Renaissance if the leader is ahead of schedule. Rushing ahead makes research dearer from then on, even for the advances you skipped. In the original, research costs double from 1 AD, and rise for everyone from then on if the leader is ahead of schedule.',
  // #973
  'civ1-enhanced.starting-advances-count.name':
    'Advances a civilization starts with count',
  'civ1-enhanced.starting-advances-count.description':
    'Every advance a civilization knows counts toward the cost of its next one, its power ranking and its chance of pollution, including those it starts the game with, or inherits when it comes back. In the original, only the advances gained once the game is under way count, so those a civilization starts with don’t make its research dearer.',
  // #1029
  'civ1-enhanced.railroads-in-cities.name': 'Cities can have a Railroad',
  'civ1-enhanced.railroads-in-cities.description':
    'Settlers can build a Railroad on a city’s square, and a unit moves along a railroad for free only between two squares that both have one. In the original, a city can’t have a Railroad, and a unit leaving a railroad moves for free onto any square with a road, so a train enters a city for free and leaves it for a road move.',
  // #1008: the set, and the choice of level beneath it. The levels and the choice share their names with Civilization
  //  II's (`translations/civ2-barbarians`), and describe what each does in this game.
  'civ1-enhanced.barbarian-activity.name':
    'You choose how active the Barbarians are',
  'civ1-enhanced.barbarian-activity.description':
    'The Barbarians come as often, as soon and in the numbers you choose below. In the original, they are always Active.',
  'civ1-enhanced.barbarian-activity.level.name':
    '$t(civ2-barbarians.activity.name)',
  'civ1-enhanced.barbarian-activity.level.description':
    '$t(civ2-barbarians.activity.description)',
  'civ1-enhanced.barbarian-activity.level.dormant.name':
    '$t(civ2-barbarians.activity.0.name)',
  'civ1-enhanced.barbarian-activity.level.dormant.description':
    'No raiders land and no uprisings break out: Barbarians come only out of goody huts.',
  'civ1-enhanced.barbarian-activity.level.sporadic.name':
    '$t(civ2-barbarians.activity.1.name)',
  'civ1-enhanced.barbarian-activity.level.sporadic.description':
    'Raiders come a little later, half as often and in smaller numbers, and uprisings are half as likely.',
  'civ1-enhanced.barbarian-activity.level.active.name':
    '$t(civ2-barbarians.activity.2.name)',
  'civ1-enhanced.barbarian-activity.level.active.description':
    'As in the original: raiders land every few turns once the Barbarians appear, and grow in numbers as the game goes on.',
  'civ1-enhanced.barbarian-activity.level.fierce.name':
    '$t(civ2-barbarians.activity.3.name)',
  'civ1-enhanced.barbarian-activity.level.fierce.description':
    'Raiders come a little sooner and in greater numbers, and uprisings are larger.',
  'civ1-enhanced.barbarian-activity.level.random.name':
    '$t(civ2-barbarians.activity.random.name)',
  'civ1-enhanced.barbarian-activity.level.random.description':
    '$t(civ2-barbarians.activity.random.description)',
});

// The eight ages (#1076), one for each research tier, named for what each tier holds: `.name` within a sentence, and
//  `.title` on its own.
i18next.addResources('en', 'science', {
  'Age.Ancient.name': 'the Ancient Age',
  'Age.Ancient.title': 'Ancient Age',
  'Age.Classical.name': 'the Classical Age',
  'Age.Classical.title': 'Classical Age',
  'Age.Medieval.name': 'the Medieval Age',
  'Age.Medieval.title': 'Medieval Age',
  'Age.Renaissance.name': 'the Renaissance',
  'Age.Renaissance.title': 'Renaissance',
  'Age.Industrial.name': 'the Industrial Age',
  'Age.Industrial.title': 'Industrial Age',
  'Age.Electric.name': 'the Electric Age',
  'Age.Electric.title': 'Electric Age',
  'Age.Modern.name': 'the Modern Age',
  'Age.Modern.title': 'Modern Age',
  'Age.Space.name': 'the Space Age',
  'Age.Space.title': 'Space Age',
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
