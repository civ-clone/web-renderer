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
  'Civilopedia.effect.clause.inCitiesWith_player':
    'in all your cities with a {{targets}}',
  'Civilopedia.effect.clause.needs': 'with {{targets}}',
  'Civilopedia.effect.clause.with': 'with {{targets}}',
  'Civilopedia.effect.clause.replaces': 'in place of {{targets}}',
  'Civilopedia.effect.clause.notWith': 'doesn’t stack with {{targets}}',
  'Civilopedia.effect.clause.against': 'against {{targets}}',
  'Civilopedia.effect.clause.except': 'except against {{targets}}',
  'Civilopedia.effect.clause.notFor': 'not for {{targets}}',
  'Civilopedia.effect.clause.notFor_defence_multiplier':
    'except when {{targets}} defend',
  'Civilopedia.effect.clause.from': 'from {{targets}}',
  'Civilopedia.effect.clause.until': 'until {{targets}}',
  'Civilopedia.effect.scope.player': 'in all your cities',
  'Civilopedia.effect.scope.continent': 'in your cities on the same continent',
  'Civilopedia.effect.scope.world': 'for every civilization',
  // Civilization II's (#1196).
  'Civilopedia.effect.content_fewer_one':
    'Makes {{count}} fewer unhappy citizen content',
  'Civilopedia.effect.content_fewer_other':
    'Makes {{count}} fewer unhappy citizens content',
  'Civilopedia.effect.happy_more_one':
    'Makes {{count}} more content citizen happy',
  'Civilopedia.effect.happy_more_other':
    'Makes {{count}} more content citizens happy',
  'Civilopedia.effect.protects_from_defeat_size':
    'The city loses no people when a defender is beaten',
  'Civilopedia.effect.protects_from_nuclear_attack_area':
    'Stops nuclear attacks within {{radius}} squares',
  'Civilopedia.effect.pollution_source_removed_production':
    'The city’s shields no longer cause pollution',
  'Civilopedia.effect.tile_yield_land_producing':
    '+{{value}} {{yield}} on each worked land square that already has {{yield}}',
  'Civilopedia.effect.tile_yield_ocean':
    '+{{value}} {{yield}} on each worked ocean square',
  'Civilopedia.effect.tile_yield': '+{{value}} {{yield}} on each worked square',
  'Civilopedia.effect.tile_yield_percent_farmland':
    '+{{percent}}% {{yield}} on Farmland and the city’s own square',
  'Civilopedia.effect.tile_yield_percent_roads':
    '+{{percent}}% {{yield}} on squares with a road or railroad, and the city’s own square',
  'Civilopedia.effect.acts_as': 'Has the effect of {{improvement}}',
  'Civilopedia.effect.veteran_units':
    'New military {{unit}} built here are veterans',
  'Civilopedia.effect.veteran_units_scope_player':
    'New military {{unit}} built in any of your cities are veterans',
  'Civilopedia.effect.heals': 'Fully repairs {{unit}} here',
  'Civilopedia.effect.airlift':
    'Lets {{unit}} fly between two cities that both have one',
  'Civilopedia.effect.content_multiplier': 'Content citizens ×{{value}}',
  'Civilopedia.effect.clause.inCitiesWith_content_multiplier':
    'from each {{targets}}',
  'Civilopedia.effect.tithe':
    'Each citizen it makes content pays a tithe of gold',
  'Civilopedia.effect.converts': 'Turns the city’s {{yield}} into {{into}}',
  'Civilopedia.effect.meltdown': 'Can melt down while the city is in disorder',
  'Civilopedia.effect.pays_upkeep_one':
    'Pays the upkeep of every building that costs {{count}} gold',
  'Civilopedia.effect.pays_upkeep_other':
    'Pays the upkeep of every building that costs {{count}} gold',
  'Civilopedia.effect.promotion_chance':
    'Every unit that wins a battle becomes a veteran',
  'Civilopedia.effect.unit_upgrade':
    'Upgrades each of your units by one step whenever you gain an advance, and when it’s built or captured',
  'Civilopedia.effect.anarchy_turns_one':
    'Changing government takes only {{count}} turn of Anarchy',
  'Civilopedia.effect.anarchy_turns_other':
    'Changing government takes only {{count}} turns of Anarchy',
  'Civilopedia.effect.embassy_with_all':
    'Gives you an embassy with every civilization',
  'Civilopedia.effect.reveals_map': 'Reveals the whole map',
  'Civilopedia.effect.enables': 'Lets {{what}} be built',
  // Where a type's own wording already says it (or its scope would read oddly), it says nothing more.
  'Civilopedia.effect.scope.player_promotion_chance': '',
  'Civilopedia.effect.scope.player_unit_upgrade': '',
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
  // The Civilization II effects #1196 left out (#1291).
  'Civilopedia.effect.barbarian_attack':
    'Barbarians attack the city with their strength ×{{value}}',
  'Civilopedia.effect.barbarian_attack_scope_player':
    'Barbarians attack your units with their strength ×{{value}}',
  'Civilopedia.effect.barbarian_defender_rerolls':
    'When barbarians attack the city, its defender rolls again on each round it loses',
  'Civilopedia.effect.attack_multiplier_barbarians':
    'Your units attack barbarian defenders at ×{{value}}',
  'Civilopedia.effect.clause.against_attack_multiplier': '',
  'Civilopedia.effect.civil_war':
    'If its city is captured, a computer player’s empire may split in a civil war',
  'Civilopedia.effect.relocates':
    'Building it in another city moves your capital there',
  'Civilopedia.effect.free_in_first_city': 'Your first city has one free',
  'Civilopedia.effect.palace_escape':
    'If its city is captured, you may pay {{value, number}} {{yield}} to move it to another city',
  // Always lost, or, with a chance, lost that often.
  'Civilopedia.effect.lost_on_capture': 'Lost when the city is captured',
  'Civilopedia.effect.lost_on_capture_other':
    'Lost {{percent}}% of the time when the city is conquered',
  'Civilopedia.effect.lost_on_capture_founder':
    'Lost when the city is captured, unless by the civilization that founded it',
  'Civilopedia.effect.lost_on_capture_founder_other':
    'Lost {{percent}}% of the time when the city is conquered, unless by the civilization that founded it',
  'Civilopedia.effect.incite_distance':
    'Makes the city dearer for an enemy to incite: its distance from your capital counts ÷{{value}}',
  'Civilopedia.effect.trade_route_link_both':
    'Trade routes to a city that also has one earn at least as much as by road',
  'Civilopedia.effect.trade_route_link_own':
    'The city’s trade routes earn as though their road link were {{value}} step better',
  'Civilopedia.effect.sold_on':
    'Every one you have is sold, for its cost in gold',
  'Civilopedia.effect.clause.with_sold_on': 'when you discover {{targets}}',
  'Civilopedia.effect.clause.below': 'below {{targets}} difficulty',
  'Civilopedia.effect.clause.atLeast': 'at {{targets}} difficulty and above',
  'Civilopedia.effect.global_warming_fewer':
    'Each city with one lowers the risk of global warming',
  'Civilopedia.effect.pollution_step_population_one':
    'The city’s people cause pollution {{count}} step lower',
  'Civilopedia.effect.pollution_step_population_other':
    'The city’s people cause pollution {{count}} steps lower',
  'Civilopedia.effect.protects_from_lost_at_sea_units':
    'No {{unit}} of yours is ever lost at sea',
  'Civilopedia.effect.heals_nearby':
    'Damaged {{unit}} within {{radius}} squares, for which this is the nearest city, recover {{value}} tenths of their hit points a turn more, rather than 1',
  'Civilopedia.effect.repairs_allies':
    'An ally’s land unit that moves against the city is repaired {{value}} tenths of its hit points, rather than 1, and stays outside',
  'Civilopedia.effect.talks_peace':
    'Computer leaders always accept your offers of peace',
  'Civilopedia.effect.talks_no_tribute':
    'Computer leaders rarely make aggressive demands for tribute',
  'Civilopedia.effect.talks_attitude':
    'Computer leaders are {{value}} points warmer to you in talks',
  'Civilopedia.effect.tribute_demand_more':
    'A computer player that owns it demands more tribute',
  'Civilopedia.effect.shared_maps':
    'Lets you exchange maps without an alliance',
  'Civilopedia.effect.talks_patience_one':
    'Computer leaders hear {{count}} more of your proposals before ending talks',
  'Civilopedia.effect.talks_patience_other':
    'Computer leaders hear {{count}} more of your proposals before ending talks',
  'Civilopedia.effect.reputation_spared_one':
    'Breaking a treaty costs you {{count}} point less reputation',
  'Civilopedia.effect.reputation_spared_other':
    'Breaking a treaty costs you {{count}} points less reputation',
  'Civilopedia.effect.reputation_recovery':
    'Your reputation recovers more often, and all the way',
  'Civilopedia.effect.attitude_drift':
    'Computer leaders’ attitude to you warms a little each turn',
  'Civilopedia.effect.reputation_halved':
    'Repairs half the damage to your reputation the first time you own it',
  'Civilopedia.effect.attitude_improved':
    'Every other leader’s attitude to you improves by {{value}} points the first time you own it',
  'Civilopedia.effect.vendettas_end':
    'Every vendetta against you ends the first time you own it',
  'Civilopedia.effect.reputation_recovers':
    'Every civilization’s reputation recovers halfway when it’s built, to {{value}} at worst',
  'Civilopedia.effect.scope.world_reputation_recovers': '',
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
  'Civilopedia.class.Trade': 'Trade',
  'Civilopedia.class.Food': 'Food',
  'Civilopedia.class.Veteran': 'Veterans',
  'Civilopedia.class.IgnoresFortifications': 'units that ignore City Walls',
  'Civilopedia.class.Naval': 'ships',
  'Civilopedia.class.Land': 'land units',
  'Civilopedia.class.Air': 'aircraft',
  'Civilopedia.class.SingleUse': 'missiles',
  'Civilopedia.class.CoastBound': 'ships that must stay by the coast',
  'Civilopedia.class.Waste': 'Waste',
  'Civilopedia.class.Part': 'spaceship parts',
  // The difficulty a Civilization II rule changes at (#1291).
  'Civilopedia.class.Prince': 'Prince',
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
