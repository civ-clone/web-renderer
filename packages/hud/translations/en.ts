// The HUD package's own text (#825).
import i18next from 'i18next';

i18next.addResources('en', 'default', {
  'Generic.no': 'No',
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
    'What would you like to build in {{- city, cityName}}?',
  'Actions.CivilDisorder.body':
    'Civil disorder in {{- city, cityName}}, mayor flees in panic!',
  'Actions.CivilDisorder.title': 'Civil disorder in {{- city, cityName}}!',
  'Actions.EndTurn.title': 'End turn',
  'Actions.Revolution.body':
    'Overthrow your government? Your civilization will fall into Anarchy for a few turns before you can choose a new one, unless you have the Pyramids.',
  'Actions.Revolution.confirm': 'Revolution!',
  'Actions.Revolution.title': 'Revolution',
  'Actions.ShowCity.label': '$t(Generic.view-city)',
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
  'ChoiceWindow.Government.adopt': 'Adopt {{- government}}',
  'ChoiceWindow.Research.cost': 'Cost in bulbs',
  // The tooltip over a city's banner on the map (#747).
  'CityBanner.grows': 'Grows to size {{size, number}}',
  'CityBanner.progress':
    '$t(Progress.data, { "progress": {{progress}}, "total": {{total}} }) · $t(Progress.turns, { "count": {{turns}} })',
  // A build a rule holds (#959): `held` says what it waits for, in place of the turns once paid for, after them before.
  'CityBanner.held':
    '$t(Progress.data, { "progress": {{progress}}, "total": {{total}} }) · {{- held}}',
  'CityBanner.will-wait':
    '$t(Progress.data, { "progress": {{progress}}, "total": {{total}} }) · $t(Progress.turns, { "count": {{turns}} }) · {{- held}}',
  'CityBanner.starving':
    '$t(Progress.data, { "progress": {{progress}}, "total": {{total}} }) · $t(CitiesList.starving)',
  'CityWindow.nothing': 'Nothing in production',
  'ChoiceWindow.Research.research': 'Research {{- advance}}',
  'ChoiceWindow.civilopedia': 'More in the Civilopedia',
  'ChoiceWindow.turns': 'Turns',
  // The sidebar's list of cities (#700).
  'CitiesList.disorder': 'Civil disorder',
  'CitiesList.empty': 'No cities yet.',
  'CitiesList.no-build': 'Nothing to build',
  'CitiesList.show-all': 'Show all ({{count, number}})',
  'CitiesList.show-fewer': 'Show fewer',
  'CitiesList.starving': 'Starving',
  'GameDetails.difficulty': '{{difficulty}} level',
  'GameDetails.turn': '{{turn, number}}',
  'Observer.pause': 'Pause',
  'Observer.paused': 'Paused between turns',
  'Observer.play': 'Play',
  'Observer.player': '{{civilization}} ({{leader}})',
  'Observer.player_no-leader': '{{civilization}}',
  'Observer.title': 'Watching the game',
  'Observer.civilizations': 'As these civilizations see it',
  'Observer.view-as': 'See the game as',
  'Observer.whole-map': 'The whole map',
  'PlayerDetails.Government.body_anarchy': `{{government}} ($t(Progress.turns-left, { "count": {{turns}} }))`,
  'PlayerDetails.Government.body_choosing':
    '{{government}} (choose a new government)',
  'PlayerDetails.Government.body_settled': '{{government}}',
  'PlayerDetails.Government.revolution':
    '{{title}} ($t(Actions.Revolution.title))',
  'PlayerDetails.Government.title': 'Government',
  'PlayerDetails.header': '{{leader}} of the {{nation}}',
  'PlayerDetails.opens': '{{title}} ({{opens}}, {{key}})',
  'PlayerDetails.Researching.Breakdown.per-turn': 'Per turn',
  'PlayerDetails.Researching.Breakdown.progress': 'Progress',
  'PlayerDetails.Researching.Breakdown.turns': 'Done in',
  'PlayerDetails.Researching.detail_notresearching': 'choose an advance',
  'PlayerDetails.Researching.detail_notresearching-anarchy':
    'no research during Anarchy',
  'PlayerDetails.Researching.detail_researching':
    '$t(Progress.turns, { "count": {{turns}} })',
  'PlayerDetails.Researching.detail_researching-anarchy':
    'no research during Anarchy',
  'PlayerDetails.Researching.progress': `$t(Progress.data, { "progress": {{progress}}, "total": {{cost}} }) ($t(Progress.per-turn, { "count": {{perTurn}} }))`,
  'PlayerDetails.Researching.title': 'Researching',
  'PlayerDetails.Researching.value_notresearching': 'Nothing',
  'PlayerDetails.Researching.value_researching': '{{researching}}',
  'PlayerDetails.TradeRates.rate': '{{name}} {{value, number}}%',
  'PlayerDetails.TradeRates.title':
    '$t(Actions.AdjustTradeRates.title) ({{key}})',
  'PlayerDetails.Treasury.Breakdown.income': 'Income',
  'PlayerDetails.Treasury.Breakdown.net': 'Net',
  'PlayerDetails.Treasury.Breakdown.treasury': 'In the treasury',
  'PlayerDetails.Treasury.Breakdown.upkeep': 'Upkeep',
  'PlayerDetails.Treasury.detail':
    '{{perTurn, number(signDisplay: exceptZero)}} / turn',
  'PlayerDetails.Treasury.detail_anarchy': 'no taxes during Anarchy',
  'PlayerDetails.Treasury.title': 'Treasury',
  'PlayerDetails.Treasury.value': '{{value, number}}',
  'Progress.turns-left_one': '{{count, number}} turn left',
  'Progress.turns-left_other': '{{count, number}} turns left',
  'Diplomat.arrives': '{{nation}} Diplomat arrives in {{- city}}',
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
  // The sidebar's Power list (#701, #708).
  'PowerList.empty': 'No rankings yet.',
  'PowerList.power': '{{power, number}}',
  'PowerList.rank': '{{rank, number}}.',
  'PowerList.show-all': 'Show all ({{count, number}})',
  'PowerList.show-fewer': 'Show fewer',
  // An unmet civilization's row: the sidebar is too narrow for more.
  'PowerList.unknown': 'Unknown',
  'PowerList.you': '(you)',
  // A Republic or Democracy choosing to break a peace treaty (#133).
  'Senate.overruled': 'Overruled by the Senate. Action canceled.',
  'Senate.title': 'The Senate',
  'SneakAttack.title': 'Sneak attack?',
  'SneakAttack.body': `Are you sure you want to attack {{nation}}? (This will terminate your current peace treaty)`,
  'SquareTooltip.city': 'City',
  'SquareTooltip.defence': 'Defense',
  'SquareTooltip.defence-bonus':
    '+{{bonus, number(style: percent; maximumFractionDigits: 0)}}',
  'SquareTooltip.improvements': 'Improvements',
  'SquareTooltip.movement-cost': 'Movement cost',
  'SquareTooltip.named': '{{- name}}: ',
  'SquareTooltip.value': '{{value, number}}',
  'SquareTooltip.worked-by': 'Worked by',
  'SquareTooltip.yields': 'Yields',
  // Moving onto, or pillaging, a treaty partner's land (#287).
  'Treaty.title': 'Peace treaty',
  'TradeRoute.keep-moving': 'Keep moving',
  'TradeRoute.will-you': 'Will you?',
  // A unit's name, then its state, in the stack window and the active unit's card (#694).
  'UnitLabel.label': '{{unit}}',
  'UnitLabel.label_state': '{{unit}} ({{states, list(type: unit)}})',
  // The active unit's square and stack, as both interfaces' unit details show them, and the wait between turns.
  'Generic.coordinates': '{{x, number}}, {{y, number}}',
  'Game.waiting': 'Waiting for the other civilizations…',
  'UnitDetails.home-city': 'Home city: {{city}} (opens the city)',
  'UnitDetails.tile-units_one':
    '{{count, number}} other unit here (choose a unit)',
  'UnitDetails.tile-units_other':
    '{{count, number}} other units here (choose a unit)',
  'UnitSelectionWindow.title': 'Activate unit',
});
