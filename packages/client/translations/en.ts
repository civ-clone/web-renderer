// The client package's own text (#825).
import i18next from 'i18next';

i18next.addResources('en', 'default', {
  'Generic.just-now': 'just now',
  'Generic.civilization-name.plural':
    '$t({{- civilization}}.plural, { "defaultValue": "{{player.civilization._}}", "ns": "civilization" })',
  'ChooseFromList.capture-city.steal-advance.body':
    'Choose an advance to acquire from {{- data, cityName}}:',
  'ChooseFromList.capture-city.steal-advance.choice':
    '$t({{value._}}.name, { "defaultValue": "{{value._}}", "ns": "science" })',
  'ChooseFromList.capture-city.steal-advance.title': 'Acquire an advance',
  'ChooseFromList.choose-civilization.body': '',
  'ChooseFromList.choose-civilization.choice':
    '$t(Generic.civilization-name.name, { "civilization": "{{value._}}", "ns": "default" })',
  'ChooseFromList.choose-civilization.random': 'Random',
  'ChooseFromList.choose-civilization.title': 'Choose your civilization',
  'ChooseFromList.choose-difficulty.body':
    'This game was saved before there were difficulty levels. Which level should it be played at?',
  'ChooseFromList.choose-difficulty.title': 'Difficulty level',
  'ChooseFromList.choose-leader.body': '',
  'ChooseFromList.choose-leader.choice':
    '$t(Generic.leader-name, { "leader": "{{value._}}", "ns": "default" })',
  'ChooseFromList.choose-leader.title': 'Choose your leader',
  'ChooseFromList.default.body': 'Please choose from the following options:',
  'ChooseFromList.default.title': 'Choose an option',
  'ChooseFromList.diplomacy.exchange-knowledge.body':
    'Please choose from the advances that $t({{data.proposal.by.civilization._}}.nation, { "defaultValue": "{{data.proposal.by.civilization._}}", "ns": "civilization" }) has discovered:',
  'ChooseFromList.diplomacy.exchange-knowledge.choice':
    '$t({{value._}}.name, { "defaultValue": "{{value._}}", "ns": "science" })',
  'ChooseFromList.diplomacy.exchange-knowledge.title': 'Exchanging Knowledge',
  'ChooseFromList.negotiation.next-step.title':
    'Negotiation between $t(Generic.civilization-name.nation, { "civilization": "{{data.players.0.civilization._}}", "ns": "default" }) and $t(Generic.civilization-name.nation, { "civilization": "{{data.players.1.civilization._}}", "ns": "default" })',
  'City.Build.auto': 'Auto',
  'City.Build.auto-stop': 'Stop Auto',
  'City.Build.buy': 'Buy',
  // Why the production picker has opened (#716).
  'City.Build.cleared.cancelled': 'Production cancelled: {{- item}}',
  'City.Build.cleared.captured': 'City captured',
  'City.Build.cleared.completed': 'Production complete: {{- item}}',
  'City.Build.cleared.created': 'City founded',
  'City.Build.cleared.unavailable': '{{- item}} can no longer be built',
  'City.Build.nothing': 'Nothing',
  'City.Build.stored_one': '{{count, number}} shield kept for the next item',
  'City.Build.stored_other': '{{count, number}} shields kept for the next item',
  // In place of the turns to a growth the rules won't allow (#781): an improvement whose name needs an article has its
  //  own sentence.
  'City.Growth.needs': 'Needs {{improvement}}',
  'City.Growth.needs-Aqueduct': 'Needs an Aqueduct',
  'City.Citizens.happy_one': '{{count, number}} happy',
  'City.Citizens.happy_other': '{{count, number}} happy',
  'City.Citizens.content_one': '{{count, number}} content',
  'City.Citizens.content_other': '{{count, number}} content',
  'City.Citizens.unhappy_one': '{{count, number}} unhappy',
  'City.Citizens.unhappy_other': '{{count, number}} unhappy',
  'City.Citizens.Specialist.Entertainer_one': '{{count, number}} Entertainer',
  'City.Citizens.Specialist.Entertainer_other':
    '{{count, number}} Entertainers',
  'City.Citizens.Specialist.Scientist_one': '{{count, number}} Scientist',
  'City.Citizens.Specialist.Scientist_other': '{{count, number}} Scientists',
  'City.Citizens.Specialist.TaxCollector_one':
    '{{count, number}} Tax collector',
  'City.Citizens.Specialist.TaxCollector_other':
    '{{count, number}} Tax collectors',
  'City.Citizens.separator': ', ',
  'City.Specialist.Entertainer': 'Entertainer',
  'City.Specialist.Scientist': 'Scientist',
  'City.Specialist.TaxCollector': 'Tax collector',
  'CustomizeWorld.build': 'Build',
  'CustomizeWorld.even-height': 'This map grid needs an even height.',
  'CustomizeWorld.max-coverage': 'Max coverage',
  'CustomizeWorld.players': 'Players',
  'CustomizeWorld.title': 'Customize world',
  'CustomizeWorld.whole-number': 'A whole number, 1 or more.',
  'DifficultyWindow.level': '{{level}}',
  'DifficultyWindow.level_easiest': '{{level}} (easiest)',
  'DifficultyWindow.level_toughest': '{{level}} (toughest)',
  'GameSetup.custom': 'Custom ({{width}} × {{height}})',
  'GameSetup.earth': 'Earth, {{size}}',
  'Negotiation.you': 'You',
  'NewGameWindow.civilizations_one': '1 civilization',
  'NewGameWindow.civilizations_other': '{{count}} civilizations',
  'NewGameWindow.WorldSize.tiny': 'Tiny ({{width}} × {{height}})',
  'NewGameWindow.WorldSize.small': 'Small ({{width}} × {{height}})',
  'NewGameWindow.WorldSize.normal': 'Normal ({{width}} × {{height}})',
  'NewGameWindow.WorldSize.large': 'Large ({{width}} × {{height}})',
  'NewGameWindow.WorldSize.huge': 'Huge ({{width}} × {{height}})',
  'ReportTable.view-city': 'View {{city}}',
  // Why the research picker has opened (#726).
  'Actions.ChooseResearch.cleared.acquired':
    '{{- advance}} was acquired before its research finished',
  'Actions.ChooseResearch.cleared.completed':
    'Research complete: {{- advance}}',
});
