// The interface-classic package's own text (#825).
import i18next from 'i18next';

i18next.addResources('en', 'default', {
  'City.Build.build-item':
    '{{- item}} (Cost: {{cost, number}} / $t(Progress.turns, {"count": {{turns}} }))',
  'City.Build.build-unit':
    '{{- item}} {{attack, number}}/{{defence, number}}/{{movement, number}}/{{visibility, number}} (Cost: {{cost, number}} / $t(Progress.turns, {"count": {{turns}} }))',
  // An item a rule would hold (#970): `held` says so after its turns, or, `waiting`, when the shields stored already pay
  //  for it, in their place.
  'City.Build.build-item_held':
    '{{- item}} (Cost: {{cost, number}} / $t(Progress.turns, {"count": {{turns}} })) – {{- held}}',
  'City.Build.build-item_waiting':
    '{{- item}} (Cost: {{cost, number}} / {{- held}})',
  'City.Build.build-unit_held':
    '{{- item}} {{attack, number}}/{{defence, number}}/{{movement, number}}/{{visibility, number}} (Cost: {{cost, number}} / $t(Progress.turns, {"count": {{turns}} })) – {{- held}}',
  'City.Build.build-unit_waiting':
    '{{- item}} {{attack, number}}/{{defence, number}}/{{movement, number}}/{{visibility, number}} (Cost: {{cost, number}} / {{- held}})',
  'City.Build.group.improvement': 'City Improvements',
  'City.Build.group.spaceship': 'Spaceship Parts',
  'City.Build.group.unit': 'Units (A/D/M/V)',
  'City.Build.group.wonder': 'Wonders of the World',
  'CityStatus.growth':
    '$t(CityStatus.totals, { "free": {{free}}, "total": {{total}}, "context": "{{totals_context}}" }) ($t(Progress.turns, {"count": {{turns}} }))',
  'HappinessReport.breakdown': 'Breakdown',
  'HappinessReport.view-city': '$t(Generic.view-city)',
  'MainMenu.customize-world': '$t(CustomizeWorld.title)',
  'MainMenu.customise': 'Customize…',
  'MainMenu.earth': 'Earth',
  'MainMenu.hall-of-fame': '$t(HallOfFame.title)',
  'MainMenu.import-assets': '$t(ImportAssetsWindow.title)',
  'MainMenu.load-game': 'Load a Saved Game',
  'MainMenu.new-game': 'Start a New Game',
  'MainMenu.quit': 'Quit',
  'MainMenu.version': 'version: {{version}}',
  'IntelligenceReport.government': 'Government: {{government}}',
  'IntelligenceReport.leader': 'Leader: {{leader}}',
  'IntelligenceReport.their-embassy': 'They have an embassy with us.',
  'IntelligenceReport.treasury': 'Treasury: {{gold, number}}',
  'MilitaryReport.stats':
    '({{attack, number}}/{{defence, number}}/{{movement, number}}/{{visibility, number}})',
  'TopCitiesReport.row': '{{rank, number}}. {{city}} ({{civilization}})',
  // As Civ1 words them (#992): "Hoover Dam in Washington. (American)", "Hoover Dam (Destroyed)". The Wonders that
  //  take "The … of" ("The Pyramids of Thebes.") say so in their own translations, by the Wonder as the context:
  //  `WondersReport.wonder_Pyramids`, `WondersReport.place_Pyramids`.
  'WondersReport.wonder': '{{- wonder}}',
  'WondersReport.place': '{{- wonder}} in {{- city}}',
  'WondersReport.standing': '{{- place}}. ({{- civilization}})',
  // In a city you haven't seen: "The Pyramids. (Aztec)", the Wonder as `WondersReport.wonder` words it.
  'WondersReport.unseen': '{{- wonder}}. ({{- civilization}})',
  'WondersReport.destroyed': '{{- wonder}} (Destroyed)',
  'TradeReport.ImprovementList.cost': '{{- icon}} {{total, number}}',
  'TradeReport.ImprovementList.item': '{{count, number}} &times; {{name}}',
  'TradeReport.ImprovementList.income-title': 'Total income',
  'TradeReport.ImprovementList.income-value':
    '{{- icon}} $t(Progress.per-turn, { "count": {{count}} })',
  'TradeReport.ImprovementList.cost-title': 'Total cost',
  'TradeReport.ImprovementList.surplus-title': 'Total surplus',
  'Buildable.label-empty': `Nothing`,
  // This can include the resource being using to buy with via {{spendCost}} which allows support for `Faith`, etc used in later games.
  // 'City.Build.buy-with': 'Buy with $t({{spendCost.resource._}}.name, { "defaultValue": "{{spendCost.resource._}}", "ns": "yield" })',
  'City.Build.buy-with': 'Buy',
  'City.GarrisonedUnits.title': 'Garrisoned units',
  'City.Growth.title': 'Growth',
  'City.SupportedUnits.title': 'Supported units',
  'CityStatus.build_empty':
    '$t(CityStatus.totals, { "free": {{free}}, "total": {{total}}, "context": "{{totals_context}}" }) $t(Buildable.label-empty)',
  'CityStatus.build_nonempty':
    '$t(CityStatus.totals, { "free": {{free}}, "total": {{total}}, "context": "{{totals_context}}" }) {{buildable}} $t(Progress.data, { "progress": {{build.progress.value}}, "total": {{build.cost.value}} }) ($t(Progress.turns, { "count": {{turns}} }))',
  // A build a rule holds once paid for (#959): what it waits for in place of its turns.
  'CityStatus.build_held':
    '$t(CityStatus.totals, { "free": {{free}}, "total": {{total}}, "context": "{{totals_context}}" }) {{buildable}} $t(Progress.data, { "progress": {{build.progress.value}}, "total": {{build.cost.value}} }) ({{held}})',
  'CityStatus.totals_equal': '{{free, number}}',
  'CityStatus.totals_unequal': '{{free, number}} [{{total, number}}]',
  'GameOptions.theme-choice.civ1-classic': 'Civ1 classic',
  'IntelligenceReport.leader_traits': 'Leader: {{leader}} ({{traits}})',
  'IntelligenceReport.military_one': 'Military: {{count, number}} Unit.',
  'IntelligenceReport.military_other': 'Military: {{count, number}} Units.',
  'IntelligenceReport.relations-peace': 'We are at PEACE with them.',
  'IntelligenceReport.relations-war': 'We are at WAR with them.',
  'MilitaryReport.active_one': '{{count, number}} active',
  'MilitaryReport.active_other': '{{count, number}} active',
  'MilitaryReport.in-production_one': '{{count, number}} in production',
  'MilitaryReport.in-production_other': '{{count, number}} in production',
  'MilitaryReport.lost_one': '{{count, number}} lost',
  'MilitaryReport.lost_other': '{{count, number}} lost',
  // The active unit's card in the sidebar (#699).
  'UnitDetails.attack': 'A',
  'UnitDetails.defence': 'D',
  'UnitDetails.moves':
    '{{remaining, number(minimumFractionDigits: 0; maximumFractionDigits: 2)}} / {{total, number}} moves',
  'UnitDetails.tile':
    '{{parts, list(type: unit)}} ($t(Generic.coordinates, { "x": {{x}}, "y": {{y}} }))',
  'UnitDetails.value': '{{value, number}}',
  'UnitDetails.visibility': 'V',
});
