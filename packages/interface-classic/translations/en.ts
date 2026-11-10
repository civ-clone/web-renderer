// The interface-classic package's own text (#825).
import i18next from 'i18next';

i18next.addResources('en', 'default', {
  'City.Build.build-item':
    '{{- item}} (Cost: {{cost, number}} / $t(Progress.turns, {"count": {{turns}} }))',
  'City.Build.build-unit':
    '{{- item}} {{attack, number}}/{{defence, number}}/{{movement, number}}/{{visibility, number}} (Cost: {{cost, number}} / $t(Progress.turns, {"count": {{turns}} }))',
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
  'TradeReport.ImprovementList.cost': '{{- icon}} {{total, number}}',
  'TradeReport.ImprovementList.item': '{{count, number}} &times; {{name}}',
  'TradeReport.ImprovementList.income-title': 'Total income',
  'TradeReport.ImprovementList.income-value':
    '{{- icon}} $t(Progress.per-turn, { "count": {{count}} })',
  'TradeReport.ImprovementList.cost-title': 'Total cost',
  'TradeReport.ImprovementList.surplus-title': 'Total surplus',
});
