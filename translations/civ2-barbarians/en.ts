import i18next from 'i18next';

// How active the barbarians are under Civilization II's rules (M2e, #1008), the New Game choice civ2-barbarians
//  registers, by id with `:` and `/` as `.`, in our own words: four levels, quietest first, and one drawn by the
//  difficulty level.
i18next.addResources('en', 'ruleset', {
  'civ2-barbarians.activity.name': 'Barbarians',
  'civ2-barbarians.activity.description':
    'How often barbarians raid from the sea and rise up near your cities, and in what numbers.',
  'civ2-barbarians.activity.0.name': 'Dormant',
  'civ2-barbarians.activity.0.description':
    'No raids or uprisings: barbarians come only out of goody huts.',
  'civ2-barbarians.activity.1.name': 'Sporadic',
  'civ2-barbarians.activity.1.description':
    'Raiders come late and seldom, and uprisings are rare.',
  'civ2-barbarians.activity.2.name': 'Active',
  'civ2-barbarians.activity.2.description':
    'Raiders and uprisings come regularly once the game is under way.',
  'civ2-barbarians.activity.3.name': 'Fierce',
  'civ2-barbarians.activity.3.description':
    'Barbarians come sooner, more often and in greater numbers, and goody huts release them from the start.',
  'civ2-barbarians.activity.random.name': 'Random',
  'civ2-barbarians.activity.random.description':
    'One of the four, drawn when the game first needs it: the harder the difficulty level, the fiercer it is likely to be.',
});

// What a person is told of the barbarians under Civilization II's rules (M2e): a ship sighted, an uprising near one of
//  their cities (with rifles and cannon once anyone knows Industrialization), and, with civ2-enhanced's uprisings, one
//  that came to nothing. A landing and a ransom are the shared notices.
i18next.addResources('en', 'notification', {
  'Barbarians.raiders-at-sea.title': 'Sails on the horizon',
  'Barbarians.raiders-at-sea.body':
    'Our lookouts have sighted a barbarian ship close by. Raiders may land soon!',
  'Barbarians.uprising-tribal.title': 'Barbarian uprising',
  'Barbarians.uprising-tribal.body':
    'Tribesmen have taken up arms near {{- city, cityName}}!',
  'Barbarians.uprising-armed.title': 'Armed uprising',
  'Barbarians.uprising-armed.body':
    'Rebels armed with modern weapons have risen near {{- city, cityName}}!',
  'Barbarians.uprising-failed.title': 'Unrest fades',
  'Barbarians.uprising-failed.body':
    'Talk of a barbarian rising near {{- city, cityName}} has come to nothing.',
});
