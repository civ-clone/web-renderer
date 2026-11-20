// The reports package's own text (#825).
import i18next from 'i18next';

i18next.addResources('en', 'default', {
  'CityBuildUnavailable.title': 'What {{- city, cityName}} can’t build',
  'CityBuildUnavailable.none': 'There is nothing this city can’t build.',
  'CityBuildUnavailable.other': 'Not available in this city',
  'Civilopedia.title': 'Civilopedia',
  'Civilopedia.back': 'Back',
  'Civilopedia.choose': 'Choose an entry from the list.',
  'Civilopedia.cost': 'Cost: {{cost, number}}',
  'Civilopedia.failed': 'The Civilopedia couldn’t be loaded.',
  'Civilopedia.heading.advances': 'Advances of this age',
  'Civilopedia.heading.age': 'Age',
  'Civilopedia.heading.effects': 'What it does',
  'Civilopedia.heading.goes-here': 'Can be built here',
  'Civilopedia.heading.subject': 'Requirements',
  'Civilopedia.heading.target': 'Leads to',
  'Civilopedia.list': '{{items}} and {{last}}',
  'Civilopedia.list_or': '{{items}} or {{last}}',
  // What an entry does (#1196), one wording per effect type a rule describes, with its context from the effect's
  //  words (`of`, `source`…), `_negative` for a value below 0 and `_zero` for 0 (which alone falls back to the wording
  //  without it). `value` and `count` are the size of the number, `percent` that as a percentage.
  'Civilopedia.effect.yield_percent_base':
    '+{{percent}}% of the city’s base {{yield}}',
  'Civilopedia.effect.yield_percent_total': '+{{percent}}% {{yield}}',
  'Civilopedia.effect.yield_percent_total_negative': '−{{percent}}% {{yield}}',
  'Civilopedia.effect.content_one': 'Makes {{count}} unhappy citizen content',
  'Civilopedia.effect.content_other':
    'Makes {{count}} unhappy citizens content',
  'Civilopedia.effect.content_more_one':
    'Makes {{count}} more unhappy citizen content',
  'Civilopedia.effect.content_more_other':
    'Makes {{count}} more unhappy citizens content',
  'Civilopedia.effect.defence_multiplier':
    'Defense of the units in the city ×{{value}}',
  'Civilopedia.effect.unit_improvement': 'Units built here are {{improvement}}',
  'Civilopedia.effect.size_limit':
    'The city can grow past size {{value, number}}',
  'Civilopedia.effect.growth_store':
    'Keeps {{percent}}% of the food when the city grows',
  'Civilopedia.effect.pollution_divisor':
    'Pollution from shields ÷{{value}} (only the city’s best divisor counts)',
  'Civilopedia.effect.pollution_source_removed_population':
    'The city’s people no longer cause pollution',
  'Civilopedia.effect.protects_from_nuclear_attack_units':
    'Units in the city survive a nuclear attack',
  'Civilopedia.effect.protects_from_nuclear_attack_size':
    'The city loses no people to a nuclear attack',
  'Civilopedia.effect.upkeep': 'Upkeep: {{value, number}} {{yield}} a turn',
  'Civilopedia.effect.upkeep_zero': 'No upkeep',
  'Civilopedia.effect.capital':
    'Your cities’ {{yield}} grows with their distance from it',
  'Civilopedia.effect.clause.per': 'for each {{targets}}',
  'Civilopedia.effect.clause.inCitiesWith': 'in cities with a {{targets}}',
  'Civilopedia.effect.clause.needs': 'with {{targets}}',
  'Civilopedia.effect.clause.with': 'with {{targets}}',
  'Civilopedia.effect.clause.replaces': 'in place of {{targets}}',
  'Civilopedia.effect.clause.notWith': 'doesn’t stack with {{targets}}',
  'Civilopedia.effect.clause.except': 'except against {{targets}}',
  'Civilopedia.effect.clause.from': 'from {{targets}}',
  'Civilopedia.effect.clause.until': 'until {{targets}}',
  'Civilopedia.effect.scope.player': 'in all your cities',
  'Civilopedia.effect.scope.continent': 'in your cities on the same continent',
  // The Wonders' effects (#1196).
  'Civilopedia.effect.content_all': 'Makes every unhappy citizen content',
  'Civilopedia.effect.tile_yield_producing':
    '+{{value}} {{yield}} on each worked square that already has {{yield}}',
  'Civilopedia.effect.happy_one': 'Makes {{count}} content citizen happy',
  'Civilopedia.effect.happy_other': 'Makes {{count}} content citizens happy',
  'Civilopedia.effect.military_unhappiness_one':
    'Each unit that causes unhappiness makes {{count}} fewer citizen unhappy',
  'Civilopedia.effect.military_unhappiness_other':
    'Each unit that causes unhappiness makes {{count}} fewer citizens unhappy',
  'Civilopedia.effect.unit_movement_one': '+{{count}} move for your {{unit}}',
  'Civilopedia.effect.unit_movement_other':
    '+{{count}} moves for your {{unit}}',
  // A unit's effect is already all of its owner's units.
  'Civilopedia.effect.scope.player_unit_movement': '',
  'Civilopedia.effect.any_government':
    'You can choose any government, without its advance',
  'Civilopedia.effect.no_anarchy':
    'Changing government needs no period of Anarchy',
  'Civilopedia.effect.pacifies':
    'Every other leader offers you peace when you meet',
  'Civilopedia.effect.shared_advances_one':
    'Gives you any advance that {{count}} other civilization knows',
  'Civilopedia.effect.shared_advances_other':
    'Gives you any advance that {{count}} other civilizations know',
  'Civilopedia.effect.free_advances_one': 'Gives you {{count}} free advance',
  'Civilopedia.effect.free_advances_other': 'Gives you {{count}} free advances',
  'Civilopedia.loading': 'Loading…',
  'Civilopedia.nothing-known': 'Nothing more is known about this yet.',
  'Civilopedia.stats':
    'Attack: {{attack, number}} · Defense: {{defense, number}} · Moves: {{movement, number}}',
  'Civilopedia.where': 'Can be built on {{terrains}}',
  'Civilopedia.section.advance': 'Civilization Advances',
  'Civilopedia.section.age': 'Ages',
  'Civilopedia.section.improvement': 'City Improvements',
  'Civilopedia.section.wonder': 'Wonders of the World',
  'Civilopedia.section.unit': 'Units',
  'Civilopedia.section.government': 'Governments',
  'Civilopedia.section.spaceship': 'Spaceship Parts',
  'Civilopedia.section.tileImprovement': 'Tile Improvements',
  'Civilopedia.section.terrain': 'Terrain Types',
  'Civilopedia.kind.advance': 'Civilization Advance',
  'Civilopedia.kind.age': 'Age',
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
  // The yields and traits effects name (#1196).
  'Civilopedia.class.CityImprovementMaintenanceGold': 'gold',
  'Civilopedia.class.Corruption': 'Corruption',
  'Civilopedia.class.Gold': 'Gold',
  'Civilopedia.class.Luxuries': 'Luxuries',
  'Civilopedia.class.Production': 'Production',
  'Civilopedia.class.Research': 'Science',
  'Civilopedia.class.Veteran': 'Veterans',
  'Civilopedia.class.IgnoresFortifications': 'units that ignore City Walls',
  'Civilopedia.class.Naval': 'ships',
  'Civilopedia.class.Part': 'spaceship parts',
  // A condition a rule decides, by its name without the rule set's prefix, so every rule set that has one shares its
  //  wording (#1051). One rule set's own wording goes under its full id (`civ1-unit.coastal-city`), which comes first.
  'Civilopedia.condition.coastal-city': 'a coastal city',
  'Civilopedia.condition.water-nearby': 'water nearby',
  'Civilopedia.condition.not-in-city': 'a city that hasn’t built one already',
  'Civilopedia.condition.mountains-or-river-nearby':
    'Mountains or a River next to the city',
  // The Hydro Plant's site with the enhanced rule on (#954), which counts the city's own square.
  'Civilopedia.condition.mountains-or-river-on-or-nearby':
    'Mountains or a River on or next to the city',
  'Civilopedia.condition.unlaunched-spaceship':
    'a spaceship that hasn’t been launched',
  // Where Civilization II's tile improvements can go.
  'Civilopedia.condition.irrigation-source':
    'water, a River or Irrigation on or next to the square',
  'Civilopedia.condition.river': 'a River on the square',
  'Civilopedia.condition.no-river': 'a square without a River',
  'Civilopedia.condition.no-fortress': 'a square without a Fortress',
  'Civilopedia.condition.no-city': 'a square without a city',
  'ScienceReport.progress_notresearching': '',
  'ScienceReport.progress_researching':
    '$t(Progress.body, { "progress": {{progress}}, "total": {{total}}, "turns": {{turns }} })',
  'ScienceReport.researching_notresearching': 'Researching nothing',
  'ScienceReport.researching_researching': 'Researching {{researching}}',
  'ScienceReport.title': 'Player research',
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
  // Under rules that rank by titles (Civ2's, M2e): `title` is one of the rule set's (`RatingTitle.*`).
  'GameOver.rating_title':
    'Sire, your Civilization Rating of {{rating}}% ranks you alongside {{title}}.',
  'GameOver.retired.body': '{{leader}} of the {{nation}} retires in {{year}}.',
  'GameOver.retired.title': 'Retired',
  'GameOver.score': 'Civilization Score: {{score, number}}',
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
  'Progress.body':
    'Progress $t(Progress.data, { "progress": {{progress}}, "total": {{total}} }) ($t(Progress.turns, {"count": {{turns}} }))',
  'CityStatus.title': 'City details',
  'HappinessReport.title': 'Happiness report',
  'IntelligenceReport.at-peace': 'At PEACE with {{nation}}.',
  'IntelligenceReport.at-war': 'At WAR with {{nation}}.',
  // Civ2's treaties beyond peace and war (M2d), and a civilization's reputation.
  'IntelligenceReport.at-alliance': 'ALLIED with {{nation}}.',
  'IntelligenceReport.at-ceasefire': 'At CEASEFIRE with {{nation}}.',
  'IntelligenceReport.at-contact': 'No treaty with {{nation}}.',
  'IntelligenceReport.age': 'Age: {{- age}}',
  'IntelligenceReport.reputation': 'Reputation: {{- reputation}}',
  // Opens talks with them, where the rules let you (Civ2's).
  'IntelligenceReport.talks': 'Send an emissary',
  // Already escaped by `Generic.city-name`.
  'IntelligenceReport.capital': 'Capital: {{- city}}',
  'IntelligenceReport.empty': 'We have not met any other civilizations yet.',
  'IntelligenceReport.foreign-affairs': 'Foreign Affairs:',
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
  'IntelligenceReport.unknown': 'Unknown',
  'MilitaryReport.losses': 'Military Losses',
  'MilitaryReport.no-losses': 'We have lost no units.',
  'MilitaryReport.no-units': 'We have no units.',
  'MilitaryReport.status': 'Military Status',
  'MilitaryReport.title': 'Military Report',
  'TopCitiesReport.empty': 'No cities have been founded yet.',
  'TopCitiesReport.title': 'Top Cities in the World',
  'TopCitiesReport.unknown-city': 'Unknown city',
  'WondersReport.empty': 'No Wonders of the World have been built yet.',
  'WondersReport.title': 'Wonders of the World',
  'TradeReport.anarchy':
    'No taxes are collected and no upkeep is paid during Anarchy.',
  'TradeReport.title': 'Trade report',
});
