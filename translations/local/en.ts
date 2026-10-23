import i18next from 'i18next';
import {
  Advance as FreeAdvance,
  City as FreeCity,
  Gold as FreeGold,
} from '@civ-clone/civ1-goody-hut/GoodyHuts';

i18next.addResources('en', 'default', {
  'Generic.cancel': 'Cancel',
  'Generic.close': 'Close',
  'Generic.coordinates': '{{x, number}}, {{y, number}}',
  'Generic.height': 'Height',
  'Generic.just-now': 'just now',
  'Generic.no': 'No',
  'Generic.ok': 'OK',
  'Generic.city-name':
    '$t({{civilization}}.{{- name}}.name, { "defaultValue": "{{name}}", "ns": "city" })',
  'Generic.civilization-name.name':
    '$t({{- civilization}}.name, { "defaultValue": "{{player.civilization._}}", "ns": "civilization" })',
  'Generic.civilization-name.nation':
    '$t({{- civilization}}.nation, { "defaultValue": "{{player.civilization._}}", "ns": "civilization" })',
  'Generic.civilization-name.plural':
    '$t({{- civilization}}.plural, { "defaultValue": "{{player.civilization._}}", "ns": "civilization" })',
  'Generic.leader-name':
    '$t(Leader.{{- leader}}.name, { "defaultValue": "{{player.civilization.leader._}}", "ns": "civilization" })',
  'Generic.view-city':
    'View $t(Generic.city-name, { "name": "{{- city.name}}", "civilization": "{{city.originalPlayer.civilization._}}", "ns": "default" })',
  'Generic.unknown-civilization': 'an unknown civilization',
  'Generic.width': 'Width',
  'Generic.yes': 'Yes',

  'Actions.AdjustTradeRates.title': 'Adjust trade rates',

  'Actions.ChooseGovernment.body':
    'Your revolution is over. Which government would you like?',
  'Actions.ChooseGovernment.title': 'Choose government',

  'Actions.ChooseResearch.body':
    'Which advance would you like to research next?',
  'Actions.ChooseResearch.choice':
    '{{- advance}} ($t(Progress.turns, { "count": {{turns}} }))',
  'Actions.ChooseResearch.title': 'Choose research',

  'Actions.CityBuildSelectionWindow.title':
    'What would you like to build in $t(Generic.city-name, { "name": "{{- city.name}}", "civilization": "{{city.originalPlayer.civilization._}}", "ns": "default" })?',

  'Actions.CivilDisorder.body':
    'Civil disorder in $t(Generic.city-name, { "name": "{{- city.name}}", "civilization": "{{city.originalPlayer.civilization._}}", "ns": "default" }), mayor flees in panic!',
  'Actions.CivilDisorder.title':
    'Civil disorder in $t(Generic.city-name, { "name": "{{- city.name}}", "civilization": "{{city.originalPlayer.civilization._}}", "ns": "default" })!',

  'Actions.EndTurn.title': 'End turn',

  'Actions.Revolution.body':
    'Overthrow your government? Your civilization will fall into Anarchy for a few turns before you can choose a new one, unless you have the Pyramids.',
  'Actions.Revolution.confirm': 'Revolution!',
  'Actions.Revolution.title': 'Revolution',

  'Actions.ShowCity.label':
    '$t(Generic.view-city, { "name": "{{- city.name}}", "civilization": "{{city.originalPlayer.civilization._}}" })',

  'Actions.ShowOnMap.label': 'Show on map',

  'Actions.Spaceship.chance-of-success': 'Chance of success',
  'Actions.Spaceship.energy': 'Energy',
  'Actions.Spaceship.flight-time': 'Flight time',
  'Actions.Spaceship.has-launched': 'Launched?',
  'Actions.Spaceship.inactive-part': '({{inactiveParts, number}} inactive)',
  'Actions.Spaceship.launch': 'Launch',
  'Actions.Spaceship.launched': 'Launched',
  'Actions.Spaceship.life-support': 'Life Support',
  'Actions.Spaceship.mass': 'Mass',
  'Actions.Spaceship.population': 'Population',
  'Actions.Spaceship.spaceship-name':
    '$t(Generic.civilization-name.name, { "civilization": "{{player.civilization._}}", "ns": "default" }) spaceship',
  'Actions.Spaceship.title': 'View spaceship',

  'Buildable.label-empty': `Nothing`,

  'ChooseFromList.capture-city.steal-advance.body':
    'Choose an advance to acquire from $t(Generic.city-name, { "name": "{{- data.name}}", "civilization": "{{data.originalPlayer.civilization._}}", "ns": "default" }):',
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
    'Please choose from the advances that $t({{data.proposal.by.civilization._}}.nation, { "defaultValue": "{{data.proposal.by.civilization._}}", "ns": "civilization" }) have discovered:',
  'ChooseFromList.diplomacy.exchange-knowledge.choice':
    '$t({{value._}}.name, { "defaultValue": "{{value._}}", "ns": "science" })',
  'ChooseFromList.diplomacy.exchange-knowledge.title': 'Exchanging Knowledge',
  'ChooseFromList.negotiation.next-step.title':
    'Negotiation between $t(Generic.civilization-name.nation, { "civilization": "{{data.players.0.civilization._}}", "ns": "default" }) and $t(Generic.civilization-name.nation, { "civilization": "{{data.players.1.civilization._}}", "ns": "default" })',

  'CityBuildUnavailable.title':
    'What $t(Generic.city-name, { "name": "{{- city.name}}", "civilization": "{{city.originalPlayer.civilization._}}", "ns": "default" }) can’t build',
  'CityBuildUnavailable.none': 'There is nothing this city can’t build.',
  'CityBuildUnavailable.other': 'Not available in this city',

  'Civilopedia.title': 'Civilopedia',
  'Civilopedia.back': 'Back',
  'Civilopedia.choose': 'Choose an entry from the list.',
  'Civilopedia.cost': 'Cost: {{cost, number}}',
  'Civilopedia.failed': 'The Civilopedia couldn’t be loaded.',
  'Civilopedia.heading.goes-here': 'Can be built here',
  'Civilopedia.heading.subject': 'Requirements',
  'Civilopedia.heading.target': 'Leads to',
  'Civilopedia.list': '{{items}} and {{last}}',
  'Civilopedia.loading': 'Loading…',
  'Civilopedia.nothing-known': 'Nothing more is known about this yet.',
  'Civilopedia.stats':
    'Attack: {{attack, number}} · Defense: {{defense, number}} · Moves: {{movement, number}}',
  'Civilopedia.where': 'Can be built on {{terrains}}',
  'Civilopedia.section.advance': 'Civilization Advances',
  'Civilopedia.section.improvement': 'City Improvements',
  'Civilopedia.section.wonder': 'Wonders of the World',
  'Civilopedia.section.unit': 'Units',
  'Civilopedia.section.government': 'Governments',
  'Civilopedia.section.spaceship': 'Spaceship Parts',
  'Civilopedia.section.tileImprovement': 'Tile Improvements',
  'Civilopedia.section.terrain': 'Terrain Types',
  'Civilopedia.kind.advance': 'Civilization Advance',
  'Civilopedia.kind.improvement': 'City Improvement',
  'Civilopedia.kind.wonder': 'Wonder of the World',
  'Civilopedia.kind.unit': 'Unit',
  'Civilopedia.kind.government': 'Government',
  'Civilopedia.kind.spaceship': 'Spaceship Part',
  'Civilopedia.kind.tileImprovement': 'Tile Improvement',
  'Civilopedia.kind.terrain': 'Terrain Type',
  'Civilopedia.subject.requires': 'Needs {{targets}}',
  'Civilopedia.subject.requires_any': 'Needs one of {{targets}}',
  'Civilopedia.subject.excludedBy': 'Can’t be built alongside {{targets}}',
  'Civilopedia.subject.excludedBy_any':
    'Can’t be built alongside any of {{targets}}',
  'Civilopedia.subject.obsoletedBy': 'Obsolete with {{targets}}',
  'Civilopedia.subject.obsoletedBy_any': 'Obsolete with any of {{targets}}',
  'Civilopedia.subject.replacedBy': 'Replaced by {{targets}}',
  'Civilopedia.subject.replacedBy_any': 'Replaced by one of {{targets}}',
  'Civilopedia.subject.enhancedBy': 'Works better with {{targets}}',
  'Civilopedia.subject.enhancedBy_any': 'Works better with any of {{targets}}',
  'Civilopedia.target.requires': 'Allows {{subject}}',
  'Civilopedia.target.excludedBy': 'Rules out {{subject}}',
  'Civilopedia.target.obsoletedBy': 'Makes {{subject}} obsolete',
  'Civilopedia.target.replacedBy': 'Replaces {{subject}}',
  'Civilopedia.target.enhancedBy': 'Makes {{subject}} work better',
  'Civilopedia.world.requires': '{{line}}, built by any civilization',
  'Civilopedia.world.obsoletedBy': '{{line}}, once any civilization has it',
  'Civilopedia.world.other': '{{line}}, for any civilization',
  'Civilopedia.class.CityImprovement': 'city improvements',
  'Civilopedia.class.Naval': 'ships',
  'Civilopedia.class.Part': 'spaceship parts',
  'Civilopedia.condition.civ1-unit.coastal-city': 'a coastal city',
  'Civilopedia.condition.civ1-unit.water-nearby': 'water nearby',
  'Civilopedia.condition.civ1-city-improvement.not-in-city':
    'a city that hasn’t built one already',
  'Civilopedia.condition.civ1-city-improvement.mountains-or-river-nearby':
    'Mountains or a River next to the city',
  'Civilopedia.condition.civ1-spaceship.unlaunched-spaceship':
    'a spaceship that hasn’t been launched',

  'City.Build.auto': 'Auto',
  'City.Build.auto-marker': 'Auto',
  'City.Build.auto-stop': 'Stop Auto',
  'City.Build.build-item':
    '{{- item}} (Cost: {{cost}} / $t(Progress.turns, {"count": {{turns}} }))',
  'City.Build.buy': 'Buy',
  'City.Build.unavailable': 'Can’t build…',
  // This can include the resource being using to buy with via {{spendCost}} which allows support for `Faith`, etc used in later games.
  // 'City.Build.buy-with': 'Buy with $t({{spendCost.resource._}}.name, { "defaultValue": "{{spendCost.resource._}}", "ns": "yield" })',
  'City.Build.buy-with': 'Buy',
  'City.Build.change': 'Change',
  'City.Build.choose': 'Choose',
  'City.Build.nothing': 'Nothing',
  'City.Build.title': '{{- item}}',

  'City.CompleteProduction.body':
    'Do you want to rush building of {{- item}} for {{spendCost.value, number}} $t({{spendCost.resource._}}.name, { "defaultValue": "{{spendCost.resource._}}", "ns": "yield" })? You currently have {{treasury.value, number}} $t({{treasury.yield._}}.name, { "defaultValue": "{{treasury.yield._}}", "ns": "yield" }) available.',

  'City.SellImprovement.body':
    'Do you want to sell your {{- item}} for {{saleValue.value, number}} $t({{saleValue.resource._}}.name, { "defaultValue": "{{saleValue.resource._}}", "ns": "yield" })?',

  'City.GarrisonedUnits.title': 'Garrisoned units',
  'City.Growth.size': 'Size {{size, number}}',

  'City.Growth.title': 'Growth',

  'City.anarchy': 'No taxes or research are collected during Anarchy.',
  'City.size': '{{size, number}}',
  'City.pollution':
    'Pollution {{count, number}}: this city may pollute the land around it',
  'City.trade-routes': 'Trade routes',
  'City.trade-route': '{{city}}: +{{trade, number}}',

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
  'City.Specialist.change': 'Change {{- specialist}}',
  'City.Specialist.Entertainer': 'Entertainer',
  'City.Specialist.Scientist': 'Scientist',
  'City.Specialist.TaxCollector': 'Tax collector',

  'City.SupportedUnits.title': 'Supported units',

  'City.Yield.deficit': '{{amount, number}} {{- yield}} short',

  'CityStatus.build_empty':
    '$t(CityStatus.totals, { "free": {{free}}, "total": {{total}}, "context": "{{totals_context}}" }) $t(Buildable.label-empty)',
  'CityStatus.build_nonempty':
    '$t(CityStatus.totals, { "free": {{free}}, "total": {{total}}, "context": "{{totals_context}}" }) {{buildable}} $t(Progress.data, { "progress": {{build.progress.value}}, "total": {{build.cost.value}} }) ($t(Progress.turns, { "count": {{turns}} }))',
  'CityStatus.growth':
    '$t(CityStatus.totals, { "free": {{free}}, "total": {{total}}, "context": "{{totals_context}}" }) ($t(Progress.turns, {"count": {{turns}} }))',
  'CityStatus.title': 'City details',
  'CityStatus.totals_equal': '{{free, number}}',
  'CityStatus.totals_unequal': '{{free, number}} [{{total, number}}]',

  'ConfirmationWindow.Generic.title': 'Are you sure?',

  'CustomizeWorld.build': 'Build',
  'CustomizeWorld.even-height': 'This map grid needs an even height.',
  'CustomizeWorld.height': '$t(Generic.height)',
  'CustomizeWorld.land-coverage': 'Land coverage',
  'CustomizeWorld.land-size': 'Land size',
  'CustomizeWorld.max-coverage': 'Max coverage',
  'CustomizeWorld.max-iterations': 'Max iterations',
  'CustomizeWorld.players': 'Players',
  'CustomizeWorld.title': 'Customize world',
  'CustomizeWorld.whole-number': 'A whole number, 1 or more.',
  'CustomizeWorld.width': '$t(Generic.width)',

  'DifficultyWindow.level': '{{level}}',
  'DifficultyWindow.level_easiest': '{{level}} (easiest)',
  'DifficultyWindow.level_toughest': '{{level}} (toughest)',
  'DifficultyWindow.title': 'Difficulty level',

  'Game.progress.player':
    'The $t({{civilization}}.plural, { "defaultValue": "{{civilization}}", "ns": "civilization" }) are moving…',
  'Game.progress.turn': 'Turn {{turn, number}}',
  'Game.progress.unmet-player': 'An unknown civilization is moving…',
  'Game.waiting': 'Waiting for the other civilizations…',
  'GameDetails.difficulty': '{{difficulty}} level',
  'GameDetails.turn': '{{turn, number}}',
  'GameDetails.year_bce': '{{year, number(useGrouping: false)}} BCE',
  'GameDetails.year_ce': '{{year, number(useGrouping: false)}} CE',

  'GameMenu.cheat.choose-advances': 'Advances',
  'GameMenu.cheat.click-map': 'Click the map to fill in the coordinates.',
  'GameMenu.cheat.create': 'Create',
  'GameMenu.cheat.create-unit': 'Create Unit',
  'GameMenu.cheat.enabled': 'Cheat mode enabled',
  'GameMenu.cheat.enter-gold-amount': 'Enter the amount of gold',
  'GameMenu.cheat.grant': 'Grant',
  'GameMenu.cheat.grant-advance': 'Grant Advance',
  'GameMenu.cheat.grant-gold': 'Grant Gold',
  'GameMenu.cheat.no-advances': 'None available',
  'GameMenu.cheat.player': 'Player',
  'GameMenu.cheat.reveal-map': 'Reveal Map',
  'GameMenu.cheat.unit-type': 'Unit type',
  'GameMenu.cheat.x': 'X',
  'GameMenu.cheat.y': 'Y',
  'GameMenu.cheat.you': 'You',
  'GameMenu.city-status': 'City Status',
  'GameMenu.happiness-report': 'Happiness Report',
  'GameMenu.intelligence-report': 'Intelligence Report',
  'GameMenu.load-game': 'Load Game',
  'GameMenu.load-game-confirm':
    'Loading a saved game will end the game in progress. Any unsaved progress will be lost.',
  'GameMenu.options': 'Options',
  'GameMenu.quit': 'Quit',
  'GameMenu.quit-confirm':
    'Quitting will end the game in progress and return to the main menu. Any unsaved progress will be lost.',
  'GameMenu.retire': 'Retire',
  'GameMenu.retire-confirm':
    'Retiring ends the game now, and you see your Civilization Score. You can keep playing afterwards, but nothing more is scored.',
  'GameMenu.save-game': 'Save Game',
  'GameMenu.save-name': 'The {{player}}, turn {{turn}}, {{date}}',
  'GameMenu.science-report': 'Science Report',
  'GameMenu.top-cities': 'Top Cities in the World',
  'GameMenu.civilization-score': 'Civilization Score',
  'GameMenu.civilopedia': 'Civilopedia',
  'GameMenu.trade-report': 'Trade Report',

  'GameOptions.title': '$t(GameMenu.options)',
  'GameOptions.auto-end-turn': 'Auto End of Turn?',
  'GameOptions.lock-vertical-edges': 'Stop the map at the poles',
  'GameOptions.map-scale': 'Map scale',
  'GameOptions.unit-edge-margin':
    'Keep the active unit this many tiles from the edge',

  'GameSetup.add-seat': 'Add a seat',
  'GameSetup.advanced': 'Advanced',
  'GameSetup.ai': 'AI',
  'GameSetup.civilization': 'Civilization',
  'GameSetup.computer': 'Computer',
  'GameSetup.custom': 'Custom ({{width}} × {{height}})',
  'GameSetup.difficulty': '$t(DifficultyWindow.title)',
  'GameSetup.earth': 'Earth, {{size}}',
  'GameSetup.grid': 'Map grid',
  'GameSetup.human': 'Human',
  'GameSetup.kind': 'Played by',
  'GameSetup.leader': 'Leader',
  'GameSetup.map': 'Map',
  'GameSetup.name': 'Name',
  'GameSetup.random': 'Random',
  'GameSetup.remove-seat': 'Remove this seat',
  'GameSetup.seat': '#',
  'GameSetup.seats': 'Seats',
  'GameSetup.start': 'Start',
  'GameSetup.title': 'Game setup',
  'Grid.hex-odd-r': 'Hex',
  'Grid.square': 'Square',
  'Grid.staggered-iso': 'Isometric',

  'HappinessReport.breakdown': 'Breakdown',
  'HappinessReport.title': 'Happiness report',
  'HappinessReport.view-city':
    '$t(Generic.view-city, { "name": "{{- city.name}}", "civilization": "{{city.originalPlayer.civilization._}}" })',

  'ImportAssetsWindow.brave':
    '<p>It looks like you\'re using Brave and due to the use of <code>HTMLCanvasElement</code>\'s <code>getImageData</code> and <code>toDataURL</code> functions, please put Shields down while importing, and playing, otherwise any color-replaced icons won\'t look correct. <strong>Remember to put them back up after!</strong></p><p><a href="https://brave.com/privacy-updates/4-fingerprinting-defenses-2.0/#2-fingerprinting-protections-20-farbling-for-great-good" target="_blank">Read more about "farbling".</a></p>',
  'ImportAssetsWindow.done':
    'Done! Please reload the page to utilize the fresh assets.',
  'ImportAssetsWindow.instructions':
    'Upload {{files, list}} from the original Civilization files to extract assets (these will be stored locally). This only takes a moment.',
  'ImportAssetsWindow.missing-files': `Please provide all files to generate assets: {{files, list}}.`,
  'ImportAssetsWindow.missing-data':
    'Not all expected data was written. Might need to try again... Missing: {{files, list}}.',
  'ImportAssetsWindow.progress-building': 'Building image assets...',
  'ImportAssetsWindow.progress-writing': 'Writing to database...',
  'ImportAssetsWindow.replace-existing': 'Replace existing assets?',
  'ImportAssetsWindow.title': 'Import assets',

  'JoinCity.too-large.body':
    '{{- city}} is too large for Settlers to join. Only cities smaller than size {{size}} can be joined.',
  'JoinCity.too-large.title': 'City too large',

  'LeaveGuard.body':
    'Leaving this page will end the game in progress. Any unsaved progress will be lost.',
  'LeaveGuard.title': 'Leave the game?',

  'LockedSlider.lock': 'Lock',

  'MainMenu.customize-world': '$t(CustomizeWorld.title)',
  'MainMenu.customise': 'Customize…',
  'MainMenu.earth': 'Earth',
  'MainMenu.hall-of-fame': '$t(HallOfFame.title)',
  'MainMenu.import-assets': '$t(ImportAssetsWindow.title)',
  'MainMenu.load-game': 'Load a Saved Game',
  'MainMenu.new-game': 'Start a New Game',
  'MainMenu.quit': 'Quit',
  'MainMenu.version': 'version: {{version}}',

  'MandatorySelection.default-body': '$t(SelectionWindow.default-body)',

  'NewGameWindow.number-of-players': 'How many players?',
  'NewGameWindow.civilizations_one': '1 civilization',
  'NewGameWindow.civilizations_other': '{{count}} civilizations',
  'NewGameWindow.map-grid': 'Which map grid?',
  'NewGameWindow.world-size': 'How big a world?',
  'NewGameWindow.WorldSize.tiny': 'Tiny ({{width}} × {{height}})',
  'NewGameWindow.WorldSize.small': 'Small ({{width}} × {{height}})',
  'NewGameWindow.WorldSize.normal': 'Normal ({{width}} × {{height}})',
  'NewGameWindow.WorldSize.large': 'Large ({{width}} × {{height}})',
  'NewGameWindow.WorldSize.huge': 'Huge ({{width}} × {{height}})',
  'Observer.pause': 'Pause',
  'Observer.paused': 'Paused between turns',
  'Observer.play': 'Play',
  'Observer.player': '{{civilization}} ({{leader}})',
  'Observer.player_no-leader': '{{civilization}}',
  'Observer.title': 'Watching the game',
  'Observer.civilizations': 'As these civilizations see it',
  'Observer.view-as': 'See the game as',
  'Observer.whole-map': 'The whole map',
  'Observer.watching': 'Watching: the computer players are taking their turns…',

  'Notification.title': 'Notification',

  'ReleaseWindow.behind-the-scenes': 'Behind the scenes',
  'ReleaseWindow.external-changes': 'External changes',
  'ReleaseWindow.failed': 'The release notes could not be loaded.',
  'ReleaseWindow.loading': 'Loading the release notes…',
  'ReleaseWindow.title': 'Releases',

  'ReloadGuard.body': 'Are you sure you want to reload?',
  'ReloadGuard.title': 'Reload',

  'SavedGame.could-not-hand-over':
    'That save could not be handed to the reloading page, so the game has not been loaded: {{- error}}',
  'SavedGame.could-not-load':
    'That save could not be loaded, so you are back at the main menu: {{- error}}',
  'SavedGame.could-not-read': 'That save could not be read: {{- error}}',

  'SavedGame.could-not-write': 'That save could not be written: {{- error}}',
  'SavedGame.needs-grid':
    'That save is on a {{- grid}} map, which can’t be drawn here, so it has not been loaded.',
  'SavedGame.no-decompression':
    'this browser cannot read compressed saves — it has no `DecompressionStream`',
  'SavedGame.not-a-save': 'the file is not a civ-clone save',

  'PlayerDetails.Government.body_anarchy': `{{government}} ($t(Progress.turns-left, { "count": {{turns}} }))`,
  'PlayerDetails.Government.body_choosing':
    '{{government}} (choose a new government)',
  'PlayerDetails.Government.body_settled': '{{government}}',
  'PlayerDetails.Government.title': 'Government',
  'PlayerDetails.header': '{{leader}} of the {{nation}}',
  'PlayerDetails.Researching.body_researching-anarchy': `{{researching}} $t(Progress.data, { "progress": {{progress}}, "total": {{cost}} }) (no research during Anarchy)`,
  'PlayerDetails.Researching.body_notresearching-anarchy':
    'Nothing (no research during Anarchy)',
  'PlayerDetails.Researching.body_notresearching':
    'Nothing ($t(Progress.per-turn, { "count": {{perTurn}} }))',
  'PlayerDetails.Researching.body_researching': `{{researching}} $t(Progress.data, { "progress": {{progress}}, "total": {{cost}} }) ($t(Progress.per-turn, { "count": {{perTurn}} }) - $t(Progress.turns, { "count": {{turns}} }))`,
  'PlayerDetails.Researching.title': 'Researching',
  'PlayerDetails.Treasury.body': `{{value}} ($t(Progress.per-turn, { "count": {{perTurn}} }))`,
  'PlayerDetails.Treasury.body_anarchy': '{{value}} (no taxes during Anarchy)',
  'PlayerDetails.Treasury.title': 'Treasury',

  'Progress.body':
    'Progress $t(Progress.data, { "progress": {{progress}}, "total": {{total}} }) ($t(Progress.turns, {"count": {{turns}} }))',
  'Progress.data': '{{progress, number}} / {{total, number}}',
  'Progress.per-turn': '{{count, number}} / turn',
  'Progress.turns-left_one': '{{count, number}} turn left',
  'Progress.turns-left_other': '{{count, number}} turns left',
  'Progress.turns_one': '{{count, number}} turn',
  'Progress.turns_other': '{{count, number}} turns',
  'Progress.turns_zero': 'Never',

  'ScienceReport.progress_notresearching': '',
  'ScienceReport.progress_researching':
    '$t(Progress.body, { "progress": {{progress}}, "total": {{total}}, "turns": {{turns }} })',
  'ScienceReport.researching_notresearching': 'Researching nothing',
  'ScienceReport.researching_researching': 'Researching {{researching}}',
  'ScienceReport.title': 'Player research',

  'Diplomat.arrives': '{{nation}} Diplomat arrives in {{- city}}',
  'Diplomat.establish-embassy': 'Establish Embassy',
  'Diplomat.investigate-city': 'Investigate City',
  'Diplomat.steal-technology': 'Steal Technology',
  'Diplomat.industrial-sabotage': 'Industrial Sabotage',
  'Diplomat.incite-revolt': 'Incite a Revolt',
  'Diplomat.meet-with-king': 'Meet with King',
  'Diplomat.peace-treaty': 'We have signed a peace treaty with the {{nation}}!',
  'Diplomat.break-treaty': 'Break treaty',
  'Diplomat.cancel-action': 'Cancel action',
  'Diplomat.incite.title': 'Incite a Revolt',
  'Diplomat.incite.body':
    'Dissidents in {{- city}} will revolt for {{cost, number}} coins.',
  'Diplomat.incite.forget': 'Forget it',
  'Diplomat.incite.incite': 'Incite revolt',
  'Diplomat.incite.subvert': 'Subvert city for {{cost, number}} coins',
  'Diplomat.bribe.title': 'Bribe',
  'Diplomat.bribe.body':
    '{{nation}} {{unit}} will desert for {{cost, number}} coins. Our treasury currently contains {{gold, number}} coins.',
  'Diplomat.bribe.bribe': 'Bribe unit',

  'IntelligenceReport.at-peace': 'At PEACE with {{nation}}.',
  'IntelligenceReport.at-war': 'At WAR with {{nation}}.',
  // Already escaped by `Generic.city-name`.
  'IntelligenceReport.capital': 'Capital: {{- city}}',
  'IntelligenceReport.empty': 'We have not met any other civilizations yet.',
  'IntelligenceReport.foreign-affairs': 'Foreign Affairs:',
  'IntelligenceReport.government': 'Government: {{government}}',
  'IntelligenceReport.leader': 'Leader: {{leader}}',
  'IntelligenceReport.leader_traits': 'Leader: {{leader}} ({{traits}})',
  'IntelligenceReport.military_one': 'Military: {{count, number}} Unit.',
  'IntelligenceReport.military_other': 'Military: {{count, number}} Units.',
  'IntelligenceReport.no-capital': 'Capital: none',
  'IntelligenceReport.no-embassy': 'No embassy established.',
  'IntelligenceReport.no-foreign-affairs':
    'No contact with other civilizations.',
  'IntelligenceReport.no-technologies': 'None.',
  'IntelligenceReport.subject': 'Subject: the {{nation}}',
  'IntelligenceReport.technologies': 'Technologies:',
  'IntelligenceReport.the': 'the {{nation}}',
  'IntelligenceReport.title': 'Intelligence Report',
  'IntelligenceReport.trait.Aggressive': 'Aggressive',
  'IntelligenceReport.trait.Civilized': 'Civilized',
  'IntelligenceReport.trait.Expansionist': 'Expansionistic',
  'IntelligenceReport.trait.Friendly': 'Friendly',
  'IntelligenceReport.trait.Militaristic': 'Militaristic',
  'IntelligenceReport.trait.Perfectionist': 'Perfectionist',
  'IntelligenceReport.treasury': 'Treasury: ${{gold, number}}',
  'IntelligenceReport.unknown': 'Unknown',

  'CivilizationScoreReport.term.citizens': 'Citizens',
  'CivilizationScoreReport.term.citizens.detail':
    '2 for each happy citizen, 1 for each content one, counted at 40% luxuries',
  'CivilizationScoreReport.term.future-technology': 'Future Technology',
  'CivilizationScoreReport.term.future-technology.detail':
    '5 for each Future Technology',
  'CivilizationScoreReport.term.peace': 'Peace',
  'CivilizationScoreReport.term.peace.detail':
    '3 for each turn of world peace, up to 100',
  'CivilizationScoreReport.term.pollution': 'Pollution',
  'CivilizationScoreReport.term.pollution.detail':
    '−10 for each polluted square in the world',
  'CivilizationScoreReport.term.spaceship': 'Spaceship',
  'CivilizationScoreReport.term.spaceship.detail':
    'Once it lands: half its colonists (in tens of thousands) × its chance of success',
  'CivilizationScoreReport.term.wonders': 'Wonders',
  'CivilizationScoreReport.term.wonders.detail': '20 for each Wonder',
  'CivilizationScoreReport.bonus': 'Conquest bonus',
  'CivilizationScoreReport.bonus.detail':
    'Conquering the world: 400, 2 for each turn before turn 550 and 100 for each opponent. It counts when it beats the rest.',
  'CivilizationScoreReport.scoring-complete': 'Scoring completed',
  'CivilizationScoreReport.title': 'Civilization Score',
  'CivilizationScoreReport.total': 'Total',

  'SelectionWindow.default-body': 'Please choose one of the following:',

  'SneakAttack.title': 'Sneak attack?',
  'SneakAttack.body': `Are you sure you want to attack {{nation}}? (This will terminate your current peace treaty)`,

  'TopCitiesReport.empty': 'No cities have been founded yet.',
  'TopCitiesReport.row': '{{rank, number}}. {{city}} ({{civilization}})',
  'TopCitiesReport.title': 'Top Cities in the World',
  'TopCitiesReport.unknown-city': 'Unknown city',

  'TradeRoute.goods.Silk': 'Silk',
  'TradeRoute.goods.Silver': 'Silver',
  'TradeRoute.goods.Wine': 'Wine',
  'TradeRoute.goods.Copper': 'Copper',
  'TradeRoute.goods.Gems': 'Gems',
  'TradeRoute.goods.Dye': 'Dye',
  'TradeRoute.goods.Salt': 'Salt',
  'TradeRoute.goods.Spice': 'Spice',
  'TradeRoute.keep-moving': 'Keep moving',
  'TradeRoute.will-you': 'Will you?',

  'TradeReport.anarchy':
    'No taxes are collected and no upkeep is paid during Anarchy.',
  'TradeReport.title': 'Trade report',
  'TradeReport.ImprovementList.cost': '{{- icon}} {{total, number}}',
  'TradeReport.ImprovementList.item': '{{count, number}} &times; {{name}}',
  'TradeReport.ImprovementList.income-title': 'Total income',
  'TradeReport.ImprovementList.income-value':
    '{{- icon}} $t(Progress.per-turn, { "count": {{count}} })',
  'TradeReport.ImprovementList.cost-title': 'Total cost',
  'TradeReport.ImprovementList.surplus-title': 'Total surplus',

  'UnitDetails.header':
    '{{unitName}} ($t(Generic.coordinates, { "x": {{x}}, "y": {{y}} }))',
  'UnitDetails.improvements': '{{improvements, list}}',
  'UnitDetails.moves':
    '{{remaining, number(minimumFractionDigits: 0; maximumFractionDigits: 2)}} / {{total, number}} moves',
  'UnitDetails.stats':
    'A: {{attack, number}} / D: {{defence, number}} / V: {{visibility, number}}',
  'UnitDetails.terrain': `{{terrain}} {{features, list}} {{improvements, list}}`,

  'UnitSelectionWindow.status_busy': '{{unit}} [{{city}}] ({{busy}})',
  'UnitSelectionWindow.status_notbusy': '{{unit}} [{{city}}]',
  'UnitSelectionWindow.title': 'Activate unit',

  'Welcome.you-have-risen':
    '$t(Generic.leader-name, { "leader": "{{player.civilization.leader._}}", "ns": "default" }), you have risen to become leader of $t(Generic.civilization-name.nation, { "civilization": "{{player.civilization._}}", "ns": "default" }).',
  'Welcome.your-people-have-knowledge-of':
    'Your people have knowledge of {{advances, list}}.',

  'Window.maximize': 'Maximize',
  'Window.minimize': 'Minimize',
  'Window.close': '$t(Generic.close)',

  'WorkerFailure.body':
    'Something went wrong in the game. It may carry on; if nothing happens, reload the page.',
  'WorkerFailure.not-answering':
    'The game has stopped answering. It may be busy and carry on; if nothing happens, reload the page.',
  'WorkerFailure.title': 'Something went wrong',

  'GameOver.conquest.body':
    'The {{nation}} have conquered the entire world. All hail {{leader}} the Conqueror!',
  'GameOver.conquest.title': 'Game over',
  'GameOver.date.body':
    'The reign of {{leader}} of the {{nation}} ends in {{year}}, after six thousand glorious years.',
  'GameOver.date.title': 'Game over',
  'GameOver.destroyed.body':
    'Archaeologists of a later age uncover the ruins of the {{nation}}, whose greatest discovery was {{discovery}}. One day, {{leader}} will return.',
  'GameOver.destroyed.title': 'Your civilization is destroyed',
  'GameOver.destroyed.body_none':
    'Archaeologists of a later age uncover the ruins of the {{nation}}. One day, {{leader}} will return.',
  'GameOver.keep-playing': 'Keep playing',
  'GameOver.main-menu': 'Main menu',
  'GameOver.rating':
    'Sire, your Civilization Rating of {{rating}}% exceeds even that of {{famousLeader}}!',
  'GameOver.rating_none': 'Sire, your Civilization Rating is {{rating}}%.',
  'GameOver.retired.body': '{{leader}} of the {{nation}} retires in {{year}}.',
  'GameOver.retired.title': 'Retired',
  'GameOver.score': 'Civilization Score: {{score}}',
  'GameOver.spaceship.title': 'Alpha Centauri',
  'GameOver.spaceship.body_known':
    'The {{winner}} have reached Alpha Centauri first. The stars will have to wait for the {{nation}}.',
  'GameOver.spaceship.body_unknown':
    'A civilization we have never met has reached Alpha Centauri first. The stars will have to wait for the {{nation}}.',
  'GameOver.spaceship.body_you':
    'Our colonists have landed on Alpha Centauri! The name of {{leader}} of the {{nation}} will live forever.',

  'FamousLeader.CharlesDeGaulle': 'Charles de Gaulle',
  'FamousLeader.Cleopatra': 'Cleopatra',
  'FamousLeader.DanQuayle': 'Dan Quayle',
  'FamousLeader.EmperorAugustus': 'Emperor Augustus',
  'FamousLeader.EricTheRed': 'Eric the Red',
  'FamousLeader.FerdinandMarcos': 'Ferdinand Marcos',
  'FamousLeader.FranklinRoosevelt': 'Franklin Roosevelt',
  'FamousLeader.KaiserWilhelm': 'Kaiser Wilhelm',
  'FamousLeader.KingCharlemagne': 'King Charlemagne',
  'FamousLeader.LouisXVI': 'Louis XVI',
  'FamousLeader.Nero': 'Emperor Nero',
  'FamousLeader.NevilleChamberlain': 'Neville Chamberlain',
  'FamousLeader.OttoVonBismarck': 'Otto von Bismarck',
  'FamousLeader.ShogunTokugawa': 'Shogun Tokugawa',
  'FamousLeader.SimonBolivar': 'Simón Bolívar',
  'FamousLeader.SolomonTheWise': 'Solomon the Wise',
  'FamousLeader.SulaymanTheMagnificent': 'Sulayman the Magnificent',
  'FamousLeader.ThomasJefferson': 'Thomas Jefferson',
  'FamousLeader.VladimirLenin': 'Vladimir Lenin',
  'FamousLeader.WinstonChurchill': 'Winston Churchill',

  'HallOfFame.column.civilization': 'Civilization',
  'HallOfFame.column.difficulty': 'Level',
  'HallOfFame.column.ending': 'Ending',
  'HallOfFame.column.rating': 'Rating',
  'HallOfFame.column.score': 'Score',
  'HallOfFame.column.year': 'Year',
  'HallOfFame.empty': 'No games yet. Finish a game to see it here.',
  'HallOfFame.leader': '{{leader}} of the {{nation}}',
  'HallOfFame.rating': '{{rating}}%',
  'HallOfFame.reason.conquest': 'Conquered the world',
  'HallOfFame.reason.date': 'Reigned to the end',
  'HallOfFame.reason.retired': 'Retired',
  'HallOfFame.reason.spaceship': 'A spaceship landed',
  'HallOfFame.title': 'Hall of Fame',
});

i18next.addResources('en', 'notification', {
  Title: '$t(Notification.title, { "ns": "default" })',
  'City.building-complete.unit.body':
    '$t(Generic.city-name, { "civilization": "{{cityBuild.city.originalPlayer.civilization._}}", "name": "{{- cityBuild.city.name}}", "ns": "default" }) has completed work on $t({{build._}}.name, { "defaultValue": "{{build._}}", "ns": "unit" })!',
  'City.building-complete.unit.title': 'Building complete!',
  'City.building-complete.city-improvement.body':
    '$t(Generic.city-name, { "civilization": "{{cityBuild.city.originalPlayer.civilization._}}", "name": "{{- cityBuild.city.name}}", "ns": "default" }) has completed work on $t(Improvement.{{build._}}.name, { "defaultValue": "{{build._}}", "ns": "city" })!',
  'City.building-complete.city-improvement.title': 'Building complete!',
  'City.building-complete.wonder.body':
    '$t(Generic.city-name, { "civilization": "{{cityBuild.city.originalPlayer.civilization._}}", "name": "{{- cityBuild.city.name}}", "ns": "default" }) has completed work on $t({{build._}}.name, { "defaultValue": "{{build._}}", "ns": "wonder" })!',
  'City.building-complete.wonder.title': 'Building complete!',
  'City.building-complete.spaceship-part.body':
    '$t(Generic.city-name, { "civilization": "{{cityBuild.city.originalPlayer.civilization._}}", "name": "{{- cityBuild.city.name}}", "ns": "default" }) has completed work on $t({{build._}}.name, { "defaultValue": "{{build._}}", "ns": "spaceship" })!',
  'City.building-complete.spaceship-part.title': 'Building complete!',
  'City.building-complete.other.body':
    '$t(Generic.city-name, { "civilization": "{{cityBuild.city.originalPlayer.civilization._}}", "name": "{{- cityBuild.city.name}}", "ns": "default" }) has completed work on its build project!',
  'City.building-complete.other.title': 'Building complete!',
  'City.captured-by-us.body':
    'We have captured $t(Generic.city-name, { "civilization": "{{city.originalPlayer.civilization._}}", "name": "{{- city.name}}", "ns": "default" }) from $t({{originalPlayer.civilization._}}.nation, { "defaultValue": "{{originalPlayer.civilization._}}", "ns": "civilization" })',
  'City.captured-by-us.title': 'City captured!',
  'City.captured-from-us.body':
    '$t({{capturingPlayer.civilization._}}.nation, { "defaultValue": "{{capturingPlayer.civilization._}}", "ns": "civilization" }) have captured our city $t(Generic.city-name, { "civilization": "{{city.originalPlayer.civilization._}}", "name": "{{- city.name}}", "ns": "default" })!',
  'City.captured-from-us.title': 'City captured!',
  'City.destroyed.body': `$t(Generic.city-name, { "civilization": "{{city.originalPlayer.civilization._}}", "name": "{{- city.name}}", "ns": "default" }) has been destroyed!`,
  'City.destroyed.title': 'City destroyed!',
  'City.destroyed-by.body':
    '$t({{player.civilization._}}.nation, { "defaultValue": "{{player.civilization._}}", "ns": "civilization" }) have destroyed our city $t(Generic.city-name, { "civilization": "{{city.originalPlayer.civilization._}}", "name": "{{- city.name}}", "ns": "default" })!',
  'City.destroyed-by.title': 'City destroyed!',
  'City.civil-disorder.body': `Civil disorder in $t(Generic.city-name, { "civilization": "{{city.originalPlayer.civilization._}}", "name": "{{- city.name}}", "ns": "default" }). Mayor flees in panic!`,
  'City.civil-disorder.title': 'Civil disorder',
  'City.leader-celebration.body': `Leader celebration in $t(Generic.city-name, { "civilization": "{{city.originalPlayer.civilization._}}", "name": "{{- city.name}}", "ns": "default" })!`,
  'City.leader-celebration.title': 'Leader celebration',
  'City.leader-celebration-ended.body': `Leader celebration canceled in $t(Generic.city-name, { "civilization": "{{city.originalPlayer.civilization._}}", "name": "{{- city.name}}", "ns": "default" })!`,
  'City.leader-celebration-ended.title': 'Leader celebration',
  'City.order-restored.body': `Order restored in $t(Generic.city-name, { "civilization": "{{city.originalPlayer.civilization._}}", "name": "{{- city.name}}", "ns": "default" }).`,
  'City.order-restored.title': 'Order restored!',
  'City.polluted.body': `Pollution near $t(Generic.city-name, { "civilization": "{{city.originalPlayer.civilization._}}", "name": "{{- city.name}}", "ns": "default" }).`,
  'City.polluted.title': 'Pollution!',
  'City.sdi-protected.body': `SDI protects $t(Generic.city-name, { "civilization": "{{city.originalPlayer.civilization._}}", "name": "{{- city.name}}", "ns": "default" }).`,
  'City.sdi-protected.title': 'SDI Defense',
  'City.unit-unsupported.body': `$t(Generic.city-name, { "civilization": "{{city.originalPlayer.civilization._}}", "name": "{{- city.name}}", "ns": "default" }) cannot support $t({{unit._}}.name, { "defaultValue": "{{unit._}}", "ns": "unit" }).`,
  'City.unit-unsupported.title': 'Unit not supported!',
  'City.improvement-unsupported.body': `$t(Generic.city-name, { "civilization": "{{city.originalPlayer.civilization._}}", "name": "{{- city.name}}", "ns": "default" }) cannot support $t(Improvement.{{cityImprovement._}}.name, { "defaultValue": "{{cityImprovement._}}", "ns": "city" }).`,
  'City.improvement-unsupported.title': 'Improvement not supported!',
  'City.food-storage-exhausted.body': `Food storage exhausted in $t(Generic.city-name, { "civilization": "{{city.originalPlayer.civilization._}}", "name": "{{- city.name}}", "ns": "default" }).`,
  'City.food-storage-exhausted.title': 'Food storage exhausted!',
  'CityImprovement.obsolete.body':
    'Development of $t({{advance._}}.name, { "defaultValue": "{{advance._}}", "ns": "science" }) makes existing $t(Improvement.{{improvement}}.name, { "defaultValue": "{{improvement}}", "ns": "city" }) obsolete.',
  'CityImprovement.obsolete.title': 'Improvement obsolete',

  'GoodyHut.action-performed.Advance.body':
    'You have discovered scrolls of ancient wisdom...',
  'GoodyHut.action-performed.Advance.title': 'Exploration',
  'GoodyHut.action-performed.City.body':
    'You have discovered an advanced tribe...',
  'GoodyHut.action-performed.City.title': 'Exploration',
  'GoodyHut.action-performed.Gold.body':
    'You have discovered valuable treasure worth 50 Gold.',
  'GoodyHut.action-performed.Gold.title': 'Exploration',
  'GoodyHut.action-performed.Unit.body':
    'You have discovered a friendly tribe of skilled mercenaries...',
  'GoodyHut.action-performed.Unit.title': 'Exploration',

  'Player.declaration-expired.body':
    'Our $t(Declaration.{{declaration._}}, { "defaultValue": "{{declaration._}}", "ns": "diplomacy" }) with $t(Generic.civilization-name.nation, { "civilization": "{{enemy.civilization._}}", "ns": "default" }) has been canceled!',
  'Player.declaration-expired.title':
    'Sneak attack by $t(Generic.civilization-name.nation, { "civilization": "{{enemy.civilization._}}", "ns": "default" })!',
  'Player.defeated.by.body':
    '$t(Generic.civilization-name.nation, { "civilization": "{{player.civilization._}}", "ns": "default" }) has defeated $t(Generic.civilization-name.nation, { "civilization": "{{defeatedPlayer.civilization._}}", "ns": "default" })!',
  'Player.defeated.by.title': 'Defeated!',
  'Player.defeated.unknown.body':
    '$t({{defeatedPlayer.civilization._}}.nation, { "defaultValue": "{{defeatedPlayer.civilization._}}", "ns": "civilization" }) defeated!',
  'Player.defeated.unknown.title': 'Defeated!',
  'Player.defeated.unmet.body':
    'News reaches us that $t(Generic.unknown-civilization, { "ns": "default" }) has been defeated!',
  'Player.defeated.unmet.title': 'Defeated!',
  'Player.defeated.unmet-by.body':
    '$t(Generic.civilization-name.nation, { "civilization": "{{player.civilization._}}", "ns": "default" }) has defeated $t(Generic.unknown-civilization, { "ns": "default" })!',
  'Player.defeated.unmet-by.title': 'Defeated!',
  'Barbarians.landing.body':
    'Barbarian raiding party lands near $t(Generic.city-name, { "civilization": "{{city.originalPlayer.civilization._}}", "name": "{{- city.name}}", "ns": "default" })! Citizens are alarmed.',
  'Barbarians.landing.title': 'Barbarians!',
  'Barbarians.uprising.body':
    'Travelers report: Barbarian uprising near $t(Generic.city-name, { "civilization": "{{city.originalPlayer.civilization._}}", "name": "{{- city.name}}", "ns": "default" })!',
  'Barbarians.uprising.title': 'Barbarian uprising',
  'Barbarians.uprising.guerrilla.body':
    'Travelers report: Guerrilla uprising near $t(Generic.city-name, { "civilization": "{{city.originalPlayer.civilization._}}", "name": "{{- city.name}}", "ns": "default" })!',
  'Barbarians.uprising.guerrilla.title': 'Guerrilla uprising',
  'Player.respawned.body':
    'Where $t(Generic.civilization-name.nation, { "civilization": "{{defeatedPlayer.civilization._}}", "ns": "default" }) once stood, a new civilization has arisen.',
  'Player.respawned.title': 'A new civilization',
  'Player.respawned.unmet.body':
    'Travelers tell of a new civilization arising in a distant land.',
  'Player.respawned.unmet.title': 'A new civilization',
  'Player.government-collapsed.body': `Civil disorder in $t(Generic.city-name, { "civilization": "{{city.originalPlayer.civilization._}}", "name": "{{- city.name}}", "ns": "default" }) has brought down your Democracy! Your civilization falls into Anarchy.`,
  'Player.government-collapsed.title': 'Government falls!',
  'Player.government-collapsed.pyramids.body': `Civil disorder in $t(Generic.city-name, { "civilization": "{{city.originalPlayer.civilization._}}", "name": "{{- city.name}}", "ns": "default" }) has brought down your Democracy! Thanks to the Pyramids, you can choose a new government straight away.`,
  'Player.government-collapsed.pyramids.title': 'Government falls!',
  'Player.research-complete.body':
    'You have discovered the secrets of $t({{advance._}}.name, { "defaultValue": "{{advance._}}", "ns": "science", "context": "numbered", "number": {{number}} })!',
  'Player.research-complete.title': 'Advance discovered!',
  'Player.spaceship-landed.body': 'Our spaceship has landed on Alpha Centauri!',
  'Player.spaceship-landed.title': 'Spaceship landed',

  'Spaceship.part-built.body':
    'Component added to $t(Generic.civilization-name.nation, { "civilization": "{{player.civilization._}}", "ns": "default" }) spaceship.',
  'Spaceship.part-built.title': 'Spaceship built',
  'Spaceship.part-built.unmet.body':
    'Component added to the spaceship of $t(Generic.unknown-civilization, { "ns": "default" }).',
  'Spaceship.part-built.unmet.title': 'Spaceship built',
  'Spaceship.cancelled.body':
    '$t(Generic.civilization-name.name, { "civilization": "{{player.civilization._}}", "ns": "default" }) spaceship construction canceled.',
  'Spaceship.cancelled.title': 'Spaceship canceled',
  'Spaceship.returned.body':
    '$t(Generic.civilization-name.name, { "civilization": "{{player.civilization._}}", "ns": "default" }) spaceship returns to Earth.',
  'Spaceship.returned.title': 'Spaceship returns',

  'Game.retirement-warning.body':
    '$t(Generic.leader-name, { "leader": "{{player.civilization.leader._}}", "ns": "default" }) plans to retire in 20 years.',
  'Game.retirement-warning.title': 'Retirement',

  'Diplomat.advance-stolen.body': `$t({{thief.civilization._}}.plural, { "defaultValue": "{{thief.civilization._}}", "ns": "civilization" }) steal $t({{advance}}.name, { "defaultValue": "{{advance}}", "ns": "science" }).`,
  'Diplomat.advance-stolen.title': 'Technology stolen!',
  'Diplomat.incited.body': `$t({{originalPlayer.civilization._}}.plural, { "defaultValue": "{{originalPlayer.civilization._}}", "ns": "civilization" }) rebel! Civil War in $t(Generic.city-name, { "civilization": "{{city.originalPlayer.civilization._}}", "name": "{{- city.name}}", "ns": "default" }). $t({{inciter.civilization._}}.name, { "defaultValue": "{{inciter.civilization._}}", "ns": "civilization" }) influence suspected.`,
  'Diplomat.incited.title': 'Civil war!',
  'Diplomat.sabotaged.improvement.body': `$t(Improvement.{{improvement}}.name, { "defaultValue": "{{improvement}}", "ns": "city" }) destroyed in $t(Generic.city-name, { "civilization": "{{city.originalPlayer.civilization._}}", "name": "{{- city.name}}", "ns": "default" }).`,
  'Diplomat.sabotaged.improvement.title': 'Industrial sabotage!',
  'Diplomat.sabotaged.production.body': `Production sabotaged in $t(Generic.city-name, { "civilization": "{{city.originalPlayer.civilization._}}", "name": "{{- city.name}}", "ns": "default" }).`,
  'Diplomat.sabotaged.production.title': 'Industrial sabotage!',
  'Diplomat.sabotaged.production.unit.body': `$t({{build._}}.name, { "defaultValue": "{{build._}}", "ns": "unit" }) production sabotaged in $t(Generic.city-name, { "civilization": "{{city.originalPlayer.civilization._}}", "name": "{{- city.name}}", "ns": "default" }).`,
  'Diplomat.sabotaged.production.unit.title': 'Industrial sabotage!',
  'Diplomat.sabotaged.production.city-improvement.body': `$t(Improvement.{{build._}}.name, { "defaultValue": "{{build._}}", "ns": "city" }) production sabotaged in $t(Generic.city-name, { "civilization": "{{city.originalPlayer.civilization._}}", "name": "{{- city.name}}", "ns": "default" }).`,
  'Diplomat.sabotaged.production.city-improvement.title':
    'Industrial sabotage!',
  'Diplomat.sabotaged.production.wonder.body': `$t({{build._}}.name, { "defaultValue": "{{build._}}", "ns": "wonder" }) production sabotaged in $t(Generic.city-name, { "civilization": "{{city.originalPlayer.civilization._}}", "name": "{{- city.name}}", "ns": "default" }).`,
  'Diplomat.sabotaged.production.wonder.title': 'Industrial sabotage!',
  'Diplomat.sabotaged.production.spaceship-part.body': `$t({{build._}}.name, { "defaultValue": "{{build._}}", "ns": "spaceship" }) production sabotaged in $t(Generic.city-name, { "civilization": "{{city.originalPlayer.civilization._}}", "name": "{{- city.name}}", "ns": "default" }).`,
  'Diplomat.sabotaged.production.spaceship-part.title': 'Industrial sabotage!',
  'Diplomat.unit-bribed.body': `$t({{previousOwner.civilization._}}.name, { "defaultValue": "{{previousOwner.civilization._}}", "ns": "civilization" }) $t({{unit}}.name, { "defaultValue": "{{unit}}", "ns": "unit" }) unit bribed by $t({{briber.civilization._}}.plural, { "defaultValue": "{{briber.civilization._}}", "ns": "civilization" })!`,
  'Diplomat.unit-bribed.title': 'Unit bribed!',
  'Unit.lost-at-sea.body': `Our $t({{unit._}}.name, { "defaultValue": "{{unit._}}", "ns": "unit" }) was lost at sea.`,
  'Unit.lost-at-sea.title': 'Unit lost at sea!',
  'Unit.trade-route-established.body': `$t(TradeRoute.goods.{{goods}}, { "defaultValue": "{{goods}}", "ns": "default" }) caravan from $t(Generic.city-name, { "civilization": "{{home.originalPlayer.civilization._}}", "name": "{{- home.name}}", "ns": "default" }) arrives in $t(Generic.city-name, { "civilization": "{{city.originalPlayer.civilization._}}", "name": "{{- city.name}}", "ns": "default" }). The goods sold for {{bonus, number}} coins.`,
  'Unit.trade-route-established.title': 'Trade route established',
  'Unit.nuclear-attack.body':
    '$t({{player.civilization._}}.nation, { "defaultValue": "{{player.civilization._}}", "ns": "civilization" }) use nuclear weapons!',
  'Unit.nuclear-attack.title': 'Nuclear attack!',
  'Unit.out-of-fuel.body': `Our $t({{unit._}}.name, { "defaultValue": "{{unit._}}", "ns": "unit" }) ran out of fuel and crashed.`,
  'Unit.out-of-fuel.title': 'Out of fuel!',

  'Wonder.building-complete.other-player.known.body':
    '$t(Generic.city-name, { "civilization": "{{city.originalPlayer.civilization._}}", "name": "{{- city.name}}", "ns": "default" }) has completed work on $t({{build._}}.name, { "defaultValue": "{{build._}}", "ns": "wonder" })!',
  'Wonder.building-complete.other-player.known.title': 'Wonder completed',
  'Wonder.building-complete.other-player.unknown.body':
    'A far away city has completed work on $t({{build._}}.name, { "defaultValue": "{{build._}}", "ns": "wonder" })!',
  'Wonder.building-complete.other-player.unknown.title': 'Wonder completed',
  'Wonder.obsolete.body':
    '$t({{wonder._}}.name, { "defaultValue": "{{wonder._}}", "ns": "wonder" }) in $t(Generic.city-name, { "civilization": "{{city.originalPlayer.civilization._}}", "name": "{{- city.name}}", "ns": "default" }) is now obsolete.',
  'Wonder.obsolete.title': 'Wonder obsolete',
});
