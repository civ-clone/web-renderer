import i18next from "i18next";
import {Advance as FreeAdvance, City as FreeCity, Gold as FreeGold} from "@civ-clone/civ1-goody-hut/GoodyHuts";

i18next.addResources(
  'en',
  'default',
  {
    'Actions.AdjustTradeRates.title': 'Adjust trade rates',

    'Actions.ChooseResearch.body': 'Which advance would you like to research next?',
    'Actions.ChooseResearch.title': 'Choose research',

    'Actions.CityBuildSelectionWindow.title': 'What would you like to build in {{cityName}}?',

    'Actions.CivilDisorder.body': 'Civil disorder in {{cityName}}, mayor flees in panic!',
    'Actions.CivilDisorder.title': 'Civil disorder in {{cityName}}!',

    'Actions.EndTurn.title': 'End turn',

    'Actions.Revolution.body': 'Which government would you like to convert to?',
    'Actions.Revolution.title': 'Choose government',

    'Actions.ShowCity.label': '$t(Generic.view-city, { "city": "{{cityName}}" })',

    'Actions.ShowOnMap.label': 'Show on map',

    'Actions.Spaceship.chance-of-success': 'Chance of success',
    'Actions.Spaceship.energy': 'Energy',
    'Actions.Spaceship.flight-time': 'Flight time',
    'Actions.Spaceship.has-launched': 'Launched?',
    'Actions.Spaceship.inactive-part': '({{inactiveParts}} inactive)',
    'Actions.Spaceship.launch': 'Launch',
    'Actions.Spaceship.launched': 'Launched',
    'Actions.Spaceship.life-support': 'Life Support',
    'Actions.Spaceship.mass': 'Mass',
    'Actions.Spaceship.population': 'Population',
    'Actions.Spaceship.spaceship-name': '{{nation}} spaceship',
    'Actions.Spaceship.title': 'View spaceship',

    'Buildable.label-empty': `Nothing`,

    'ChooseFromList.choose-civilization.body': '',
    'ChooseFromList.choose-civilization.choice': '$t({{value._}}.name, { "defaultValue": "{{value._}}", "ns": "civilization" })',
    'ChooseFromList.choose-civilization.title': 'Choose your civilization',
    'ChooseFromList.choose-leader.body': '',
    'ChooseFromList.choose-leader.choice': '$t(Leader.{{value._}}.name, { "defaultValue": "{{value._}}", "ns": "civilization" })',
    'ChooseFromList.choose-leader.title': 'Choose your leader',
    'ChooseFromList.default.body': 'Please choose from the following options:',
    'ChooseFromList.default.title': 'Choose an option',
    'ChooseFromList.diplomacy.exchange-knowledge.body': 'Please choose from the advances that $t({{data.proposal.by.civilization._}}.nation, { "defaultValue": "{{data.proposal.by.civilization._}}", "ns": "civilization" }) have discovered:',
    'ChooseFromList.diplomacy.exchange-knowledge.choice': '$t({{value._}}.name, { "defaultValue": "{{value._}}", "ns": "science" })',
    'ChooseFromList.diplomacy.exchange-knowledge.title': 'Exchanging Knowledge',
    'ChooseFromList.negotiation.next-step.title': 'Negotiation between $t({{data.players.0.civilization._}}.nation, { "defaultValue": "{{data.players.0.civilization._}}", "ns": "civilization" }) and $t({{data.players.1.civilization._}}.nation, { "defaultValue": "{{data.players.1.civilization._}}", "ns": "civilization" })',

    'City.Build.build-item': '{{item}} (Cost: {{cost}} / $t(Progress.turns, {"count": {{turns}} }))',
    'City.Build.buy': 'Buy',
    // This can include the resource being using to buy with via {{spendCost}} which allows support for `Faith`, etc used in later games.
    // 'City.Build.buy-with': 'Buy with $t({{spendCost.resource._}}.name, { "defaultValue": "{{spendCost.resource._}}", "ns": "yield" })',
    'City.Build.buy-with': 'Buy',
    'City.Build.change': 'Change',
    'City.Build.choose': 'Choose',
    'City.Build.nothing': 'Nothing',
    'City.Build.title': '{{item}}',

    'City.CompleteProduction.body': 'Do you want to rush building of {{item}} for {{spendCost.value, number}} $t({{spendCost.resource._}}.name, { "defaultValue": "{{spendCost.resource._}}", "ns": "yield" })? You currently have {{treasury.value, number}} $t({{treasury.yield._}}.name, { "defaultValue": "{{treasury.yield._}}", "ns": "yield" }) available.',

    'City.GarrisonedUnits.title': 'Garrisoned units',
    'City.Growth.size': 'Size {{size, number}}',

    'City.Growth.title': 'Growth',

    'City.size': '{{size, number}}',

    'City.SupportedUnits.title': 'Supported units',

    'CityStatus.build_empty': '$t(CityStatus.totals, { "free": {{free}}, "total": {{total}}, "context": "{{totals_context}}" }) $t(Buildable.label-empty)',
    'CityStatus.build_nonempty': '$t(CityStatus.totals, { "free": {{free}}, "total": {{total}}, "context": "{{totals_context}}" }) {{buildable}} ($t(Progress.turns, { "count": {{turns}} }))',
    'CityStatus.growth': '$t(CityStatus.totals, { "free": {{free}}, "total": {{total}}, "context": "{{totals_context}}" }) ($t(Progress.turns, {"count": {{turns}} }))',
    'CityStatus.title': 'City details',
    'CityStatus.totals_equal': '{{free, number}}',
    'CityStatus.totals_unequal': '{{free, number}} [{{total, number}}]',

    'ConfirmationWindow.Generic.title': 'Are you sure?',

    'CustomizeWorld.build': 'Build',
    'CustomizeWorld.height': '$t(Generic.height)',
    'CustomizeWorld.land-coverage': 'Land coverage',
    'CustomizeWorld.land-size': 'Land size',
    'CustomizeWorld.max-coverage': 'Max coverage',
    'CustomizeWorld.players': 'Players',
    'CustomizeWorld.title': 'Customize world',
    'CustomizeWorld.width': '$t(Generic.width)',

    'GameDetails.turn': '{{turn, number}}',
    'GameDetails.year_bce': '{{year, number(useGrouping: false)}} BCE',
    'GameDetails.year_ce': '{{year, number(useGrouping: false)}} CE',

    'GameMenu.city-status': 'City Status',
    'GameMenu.happiness-report': 'Happiness Report',
    'GameMenu.options': 'Options',
    'GameMenu.science-report': 'Science Report',
    'GameMenu.trade-report': 'Trade Report',

    'GameOptions.auto-end-turn': 'Auto End of Turn?',

    'HappinessReport.breakdown': 'Breakdown',
    'HappinessReport.view-city': '$t(Generic.view-city, { "city": "{{cityName}}" })',

    'ImportAssetsWindow.brave': '<p>It looks like you\'re using Brave and due to the use of <code>HTMLCanvasElement</code>\'s <code>getImageData</code> and <code>toDataURL</code> functions, please put Shields down while importing, and playing, otherwise any colour-replaced icons won\'t look correct. <strong>Remember to put them back up after!</strong></p><p><a href="https://brave.com/privacy-updates/4-fingerprinting-defenses-2.0/#2-fingerprinting-protections-20-farbling-for-great-good" target="_blank">Read more about "farbling".</a></p>',
    'ImportAssetsWindow.done': 'Done! Please reload the page to utilise the fresh assets.',
    'ImportAssetsWindow.instructions': 'Upload {{files, list}} from the original Civilization files to extract assets (these will be stored locally). This process can take at least a few minutes.',
    'ImportAssetsWindow.missing-files': `Please provide all files to generate assets: {{files, list}}.`,
    'ImportAssetsWindow.missing-data': 'Not all expected data was written. Might need to try again... Missing: {{files, list}}.',
    'ImportAssetsWindow.progress-building': 'Building image assets...',
    'ImportAssetsWindow.progress-writing': 'Writing to database...',
    'ImportAssetsWindow.title': 'Import assets',

    'LockedSlider.lock': 'Lock',

    'MainMenu.customize-world': '$t(CustomizeWorld.title)',
    'MainMenu.earth': 'Earth',
    'MainMenu.import-assets': '$t(ImportAssetsWindow.title)',
    'MainMenu.new-game': 'Start a New Game',
    'MainMenu.quit': 'Quit',
    'MainMenu.version': 'version: {{version}}',

    'MandatorySelection.default-body': '$t(SelectionWindow.default-body)',

    'NewGameWindow.number-of-players': 'How many players?',
    'NewGameWindow.civilizations_one': '1 civilization',
    'NewGameWindow.civilizations_other': '{{count}} civilizations',

    'Notification.title': 'Notification',

    'PlayerDetails.header': '{{leader}} of the {{nation}}',
    'PlayerDetails.Researching.body_notresearching': 'Nothing ($t(Progress.per-turn, { "count": {{perTurn}} }))',
    'PlayerDetails.Researching.body_researching': `{{researching}} $t(Progress.data, { "progress": {{progress}}, "total": {{cost}} }) ($t(Progress.per-turn, { "count": {{perTurn}} }) - $t(Progress.turns, { "count": {{turns}} }))`,
    'PlayerDetails.Researching.title': 'Researching',
    'PlayerDetails.Treasury.body': `{{value}} ($t(Progress.per-turn, { "count": {{perTurn}} }))`,
    'PlayerDetails.Treasury.title': 'Treasury',

    'Progress.body': 'Progress $t(Progress.data, { "progress": {{progress}}, "total": {{total}} }) ($t(Progress.turns, {"count": {{turns}} }))',
    'Progress.data': '{{progress, number}} / {{total, number}}',
    'Progress.per-turn': '{{count, number}} / turn',
    'Progress.turns_one': '{{count, number}} turn',
    'Progress.turns_other': '{{count, number}} turns',
    'Progress.turns_zero': 'Never',

    'ScienceReport.progress_notresearching': '',
    'ScienceReport.progress_researching': '$t(Progress.body, { "progress": {{progress}}, "total": {{total}}, "turns": {{turns }} })',
    'ScienceReport.researching_notresearching': 'Researching nothing',
    'ScienceReport.researching_researching': 'Researching {{researching}}',
    'ScienceReport.title': 'Player research',

    'SelectionWindow.default-body': 'Please choose one of the following:',

    'SneakAttack.title': 'Sneak attack?',
    'SneakAttack.body': `Are you sure you want to attack {{nation}}? (This will terminate your current peace treaty)`,

    'TradeReport.title': 'Trade report',
    'TradeReport.ImprovementList.cost': '{{- icon}} {{total, number}}',
    'TradeReport.ImprovementList.item': '{{count, number}} &times; {{name}}',
    'TradeReport.ImprovementList.income-title': 'Total income',
    'TradeReport.ImprovementList.income-value': '{{- icon}} $t(Progress.per-turn, { "count": {{count}} })',
    'TradeReport.ImprovementList.cost-title': 'Total cost',
    'TradeReport.ImprovementList.cost-value': '{{- icon}} $t(Progress.per-turn, { "count": {{count}} })',
    'TradeReport.ImprovementList.surplus-title': 'Total surplus',
    'TradeReport.ImprovementList.surplus-value': '{{- icon}} $t(Progress.per-turn, { "count": {{count}} })',

    'UnitDetails.header': '{{unitName}} ($t(Generic.coordinates, { "x": {{x}}, "y": {{y}} }))',
    'UnitDetails.improvements': '{{improvements, list}}',
    'UnitDetails.moves': '{{remaining, number(minimumFractionDigits: 0; maximumFractionDigits: 2)}} / {{total, number}} moves',
    'UnitDetails.stats': 'A: {{attack, number}} / D: {{defence, number}} / V: {{visibility, number}}',
    'UnitDetails.terrain': `{{terrain}} {{features, list}} {{improvements, list}}`,

    'UnitSelectionWindow.status_busy': '{{unit}} [{{city}}] ({{busy}})',
    'UnitSelectionWindow.status_notbusy': '{{unit}} [{{city}}]',
    'UnitSelectionWindow.title': 'Activate unit',

    'Welcome.you-have-risen': '{{leader}}, you have risen to become leader of the {{nation}}.',
    'Welcome.your-people-have-knowledge-of': 'Your people have knowledge of {{advances, list}}.',

    'Window.maximize': 'Maximize',
    'Window.minimize': 'Minimize',
    'Window.close': '$t(Generic.close)',

    'Generic.cancel': 'Cancel',
    'Generic.close': 'Close',
    'Generic.coordinates': '{{x, number}}, {{y, number}}',
    'Generic.height': 'Height',
    'Generic.no': 'No',
    'Generic.ok': 'OK',
    'Generic.view-city': 'View {{city}}',
    'Generic.width': 'Width',
    'Generic.yes': 'Yes',
  }
);

i18next.addResources('en', 'notification', {
    'Title': '$t(Notification.title, { "ns": "default" })',
    'City.building-complete.unit.body': '$t({{cityBuild.city.originalPlayer.civilization._}}.{{cityBuild.city.name}}.name, { "defaultValue": "{{cityBuild.city.name}}", "ns": "city" }) has completed work on $t({{build._}}.name, { "defaultValue": "{{build._}}", "ns": "unit" })!',
    'City.building-complete.unit.title': 'Building complete!',
    'City.building-complete.city-improvement.body': '$t({{cityBuild.city.originalPlayer.civilization._}}.{{cityBuild.city.name}}.name, { "defaultValue": "{{cityBuild.city.name}}", "ns": "city" }) has completed work on $t(Improvement.{{build._}}.name, { "defaultValue": "{{build._}}", "ns": "city" })!',
    'City.building-complete.city-improvement.title': 'Building complete!',
    'City.building-complete.wonder.body': '$t({{cityBuild.city.originalPlayer.civilization._}}.{{cityBuild.city.name}}.name, { "defaultValue": "{{cityBuild.city.name}}", "ns": "city" }) has completed work on $t({{build._}}.name, { "defaultValue": "{{build._}}", "ns": "wonder" })!',
    'City.building-complete.wonder.title': 'Building complete!',
    'City.building-complete.spaceship-part.body': '$t({{cityBuild.city.originalPlayer.civilization._}}.{{cityBuild.city.name}}.name, { "defaultValue": "{{cityBuild.city.name}}", "ns": "city" }) has completed work on $t({{build._}}.name, { "defaultValue": "{{build._}}", "ns": "spaceship" })!',
    'City.building-complete.spaceship-part.title': 'Building complete!',
    'City.building-complete.other.body': '$t({{cityBuild.city.originalPlayer.civilization._}}.{{cityBuild.city.name}}.name, { "defaultValue": "{{cityBuild.city.name}}", "ns": "city" }) has completed work on its build project!',
    'City.building-complete.other.title': 'Building complete!',
    'City.captured-by-us.body': 'We have captured $t({{city.originalPlayer.civilization._}}.{{city.name}}.name, { "defaultValue": "{{city.name}}", "ns": "city" }) from $t({{originalPlayer.civilization._}}.nation, { "defaultValue": "{{originalPlayer.civilization._}}", "ns": "civilization" })',
    'City.captured-by-us.title': 'City captured!',
    'City.captured-from-us.body': '$t({{capturingPlayer.civilization._}}.nation, { "defaultValue": "{{capturingPlayer.civilization._}}", "ns": "civilization" }) have captured our city $t({{city.originalPlayer.civilization._}}.{{city.name}}.name, { "defaultValue": "{{city.name}}", "ns": "city" })!',
    'City.captured-from-us.title': 'City captured!',
    'City.civil-disorder.body': `Civil disorder in $t({{city.originalPlayer.civilization._}}.{{city.name}}.name, { "defaultValue": "{{city.name}}", "ns": "city" }). Mayor flees in panic!`,
    'City.civil-disorder.title': 'Civil disorder',
    'City.leader-celebration.body': `Leader celebration in $t({{city.originalPlayer.civilization._}}.{{city.name}}.name, { "defaultValue": "{{city.name}}", "ns": "city" })!`,
    'City.leader-celebration.title': 'Leader celebration',
    'City.leader-celebration-ended.body': `Leader celebration cancelled in $t({{city.originalPlayer.civilization._}}.{{city.name}}.name, { "defaultValue": "{{city.name}}", "ns": "city" })!`,
    'City.leader-celebration-ended.title': 'Leader celebration',
    'City.order-restored.body': `Order restored in $t({{city.originalPlayer.civilization._}}.{{city.name}}.name, { "defaultValue": "{{city.name}}", "ns": "city" }).`,
    'City.order-restored.title': 'Order restored!',
    'City.shrink.body': `Population decrease in $t({{city.originalPlayer.civilization._}}.{{city.name}}.name, { "defaultValue": "{{city.name}}", "ns": "city" }).`,
    'City.shrink.title': 'Population decrease!',
    'City.unit-unsupported.body': `$t({{city.originalPlayer.civilization._}}.{{city.name}}.name, { "defaultValue": "{{city.name}}", "ns": "city" }) cannot support $t({{unit._}}.name, { "defaultValue": "{{unit._}}", "ns": "unit" }).`,
    'City.unit-unsupported.title': 'Unit not supported!',
    'City.improvement-unsupported.body': `$t({{city.originalPlayer.civilization._}}.{{city.name}}.name, { "defaultValue": "{{city.name}}", "ns": "city" }) cannot support $t(Improvement.{{cityImprovement._}}.name, { "defaultValue": "{{cityImprovement._}}", "ns": "city" }).`,
    'City.improvement-unsupported.title': 'Improvement not supported!',
    'City.food-storage-exhausted.body': `Food storage exhausted in $t({{city.originalPlayer.civilization._}}.{{city.name}}.name, { "defaultValue": "{{city.name}}", "ns": "city" }).`,
    'City.food-storage-exhausted.title': 'Food storage exhausted!',

    'GoodyHut.action-performed.Advance.body': 'You have discovered scrolls of ancient wisdom...',
    'GoodyHut.action-performed.Advance.title': 'Exploration',
    'GoodyHut.action-performed.City.body': 'You have discovered an advanced tribe...',
    'GoodyHut.action-performed.City.title': 'Exploration',
    'GoodyHut.action-performed.Gold.body': 'You have discovered valuable treasure worth 50 Gold.',
    'GoodyHut.action-performed.Gold.title': 'Exploration',
    'GoodyHut.action-performed.Unit.body': 'You have discovered a friendly tribe of skilled mercenaries...',
    'GoodyHut.action-performed.Unit.title': 'Exploration',

    'Player.defeated.by.body': '$t({{player.civilization._}}.nation, { "defaultValue": "{{player.civilization._}}", "ns": "civilization" }) has defeated $t({{defeatedPlayer.civilization._}}.nation, { "defaultValue": "{{defeatedPlayer.civilization._}}", "ns": "civilization" })!',
    'Player.defeated.by.title': 'Defeated!',
    'Player.defeated.local.body': 'You have been defeated by $t({{player.civilization._}}.nation, { "defaultValue": "{{player.civilization._}}", "ns": "civilization" })!',
    'Player.defeated.local.title': 'Defeated!',
    'Player.defeated.unknown.body': '$t({{defeatedPlayer.civilization._}}.nation, { "defaultValue": "{{defeatedPlayer.civilization._}}", "ns": "civilization" }) defeated!',
    'Player.defeated.unknown.title': 'Defeated!',
    'Player.research-complete.body': 'You have discovered the secrets of $t({{advance._}}.name, { "defaultValue": "{{advance._}}", "ns": "science" })!',
    'Player.research-complete.title': 'Advance discovered!',
    'Player.spaceship-landed.body': 'Our spaceship has landed on Alpha Centauri!',
    'Player.spaceship-landed.title': 'Spaceship landed',
    'Player.spaceship-lost.body': 'Our spaceship was lost in space.',
    'Player.spaceship-lost.title': 'Spaceship lost',

    'Spaceship.part-built.body': 'Component added to $t({{player.civilization._}}.name, { "defaultValue": "{{player.civilization._}}", "ns": "civilization" }) spaceship.',
    'Spaceship.part-built.title': 'Spaceship built',

    'Wonder.building-complete.other-player.known.body': '$t({{city.originalPlayer.civilization._}}.{{city.name}}.name, { "defaultValue": "{{city.name}}", "ns": "city" }) has completed work on $t({{build._}}.name, { "defaultValue": "{{build._}}", "ns": "wonder" })!',
    'Wonder.building-complete.other-player.known.title': 'Wonder completed',
    'Wonder.building-complete.other-player.unknown.body': 'A far away city has completed work on $t({{build._}}.name, { "defaultValue": "{{build._}}", "ns": "wonder" })!',
    'Wonder.building-complete.other-player.unknown.title': 'Wonder completed',
});
