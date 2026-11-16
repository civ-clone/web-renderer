// The protocol package's own text (#825).
import i18next from 'i18next';

i18next.addResources('en', 'default', {
  'Generic.height': 'Height',
  // `cityName` looks the name up on the founder's list (`i18nFormatters`).
  'Generic.city-name': '{{- name, cityName}}',
  'Generic.civilization-name.name':
    '$t({{- civilization}}.name, { "defaultValue": "{{player.civilization._}}", "ns": "civilization" })',
  'Generic.civilization-name.nation':
    '$t({{- civilization}}.nation, { "defaultValue": "{{- civilization}}", "ns": "civilization" })',
  // For a nation that opens a sentence: `.nation` carries its own article ("the Aztec Empire"), lower case for
  //  anywhere else in a sentence (#359).
  'Generic.civilization-name.nation-start':
    '$t(Generic.civilization-name.nation, capitalise)',
  'Generic.leader-name':
    '$t(Leader.{{- leader}}.name, { "defaultValue": "{{player.civilization.leader._}}", "ns": "civilization" })',
  'Generic.view-city': 'View {{- city, cityName}}',
  'Generic.unknown-civilization': 'an unknown civilization',
  'Generic.unknown-civilization-start':
    '$t(Generic.unknown-civilization, capitalise)',
  'Generic.width': 'Width',
  'Game.progress.player':
    'The $t({{civilization}}.plural, { "defaultValue": "{{civilization}}", "ns": "civilization" }) are moving…',
  'Game.progress.turn': 'Turn {{turn, number}}',
  'Game.progress.unmet-player': 'An unknown civilization is moving…',
  'Notification.title': 'Notification',
  'SavedGame.autosave-failed': 'This turn could not be autosaved: {{- error}}',
  'Diplomat.establish-embassy': 'Establish Embassy',
  'Diplomat.investigate-city': 'Investigate City',
  'Diplomat.steal-technology': 'Steal Technology',
  'Diplomat.industrial-sabotage': 'Industrial Sabotage',
  'Diplomat.incite-revolt': 'Incite a Revolt',
  'Diplomat.meet-with-leader': 'Meet with Leader',
  'TradeRoute.goods.Silk': 'Silk',
  'TradeRoute.goods.Silver': 'Silver',
  'TradeRoute.goods.Wine': 'Wine',
  'TradeRoute.goods.Copper': 'Copper',
  'TradeRoute.goods.Gems': 'Gems',
  'TradeRoute.goods.Dye': 'Dye',
  'TradeRoute.goods.Salt': 'Salt',
  'TradeRoute.goods.Spice': 'Spice',
});

i18next.addResources('en', 'notification', {
  Title: '$t(Notification.title, { "ns": "default" })',
  'City.building-complete.unit.body':
    '{{- cityBuild.city, cityName}} has completed work on $t({{build._}}.name, { "defaultValue": "{{build._}}", "ns": "unit" })!',
  'City.building-complete.unit.title': 'Building complete!',
  'City.building-complete.city-improvement.body':
    '{{- cityBuild.city, cityName}} has completed work on $t(Improvement.{{build._}}.name, { "defaultValue": "{{build._}}", "ns": "city" })!',
  'City.building-complete.city-improvement.title': 'Building complete!',
  'City.building-complete.wonder.body':
    '{{- cityBuild.city, cityName}} has completed work on $t({{build._}}.name, { "defaultValue": "{{build._}}", "ns": "wonder" })!',
  'City.building-complete.wonder.title': 'Building complete!',
  'City.building-complete.spaceship-part.body':
    '{{- cityBuild.city, cityName}} has completed work on $t({{build._}}.name, { "defaultValue": "{{build._}}", "ns": "spaceship" })!',
  'City.building-complete.spaceship-part.title': 'Building complete!',
  // An item the city's queue dropped, as it could no longer build it (#774), by kind, as completions are.
  'City.queue-dropped.unit.body':
    '{{- city, cityName}} can no longer build $t({{item._}}.name, { "defaultValue": "{{item._}}", "ns": "unit" }), so it was dropped from the queue$t(City.queue-dropped.more, { "count": {{more}} }).',
  'City.queue-dropped.city-improvement.body':
    '{{- city, cityName}} can no longer build $t(Improvement.{{item._}}.name, { "defaultValue": "{{item._}}", "ns": "city" }), so it was dropped from the queue$t(City.queue-dropped.more, { "count": {{more}} }).',
  'City.queue-dropped.wonder.body':
    '{{- city, cityName}} can no longer build $t({{item._}}.name, { "defaultValue": "{{item._}}", "ns": "wonder" }), so it was dropped from the queue$t(City.queue-dropped.more, { "count": {{more}} }).',
  'City.queue-dropped.spaceship-part.body':
    '{{- city, cityName}} can no longer build $t({{item._}}.name, { "defaultValue": "{{item._}}", "ns": "spaceship" }), so it was dropped from the queue$t(City.queue-dropped.more, { "count": {{more}} }).',
  'City.queue-dropped.other.body':
    '{{- city, cityName}} can no longer build part of its queue, so it was dropped$t(City.queue-dropped.more, { "count": {{more}} }).',
  'City.queue-dropped.more_zero': '',
  'City.queue-dropped.more_one': ', with {{count, number}} more',
  'City.queue-dropped.more_other': ', with {{count, number}} more',
  'City.queue-dropped.unit.title': 'Dropped from the queue',
  'City.queue-dropped.city-improvement.title': 'Dropped from the queue',
  'City.queue-dropped.wonder.title': 'Dropped from the queue',
  'City.queue-dropped.spaceship-part.title': 'Dropped from the queue',
  'City.queue-dropped.other.title': 'Dropped from the queue',
  // A build paid for and waiting, as rules hold it (#970), by kind: `reason` is what it waits for, in the city screen's
  //  words for a build waiting now, worded by the page from the ids of the rules (`heldNoticeData`).
  'City.building-held.unit.body':
    'Production of $t({{item._}}.name, { "defaultValue": "{{item._}}", "ns": "unit" }) in {{- city, cityName}} is paid for. {{- reason}}.',
  'City.building-held.unit.title': 'Production waiting',
  'City.building-held.city-improvement.body':
    'Production of $t(Improvement.{{item._}}.name, { "defaultValue": "{{item._}}", "ns": "city" }) in {{- city, cityName}} is paid for. {{- reason}}.',
  'City.building-held.city-improvement.title': 'Production waiting',
  'City.building-held.wonder.body':
    'Production of $t({{item._}}.name, { "defaultValue": "{{item._}}", "ns": "wonder" }) in {{- city, cityName}} is paid for. {{- reason}}.',
  'City.building-held.wonder.title': 'Production waiting',
  'City.building-held.spaceship-part.body':
    'Production of $t({{item._}}.name, { "defaultValue": "{{item._}}", "ns": "spaceship" }) in {{- city, cityName}} is paid for. {{- reason}}.',
  'City.building-held.spaceship-part.title': 'Production waiting',
  'City.building-held.other.body':
    'Production in {{- city, cityName}} is paid for. {{- reason}}.',
  'City.building-held.other.title': 'Production waiting',
  'City.building-complete.other.body':
    '{{- cityBuild.city, cityName}} has completed work on its build project!',
  'City.building-complete.other.title': 'Building complete!',
  'City.captured-by-us.body':
    'We have captured {{- city, cityName}} from $t({{originalPlayer.civilization._}}.nation, { "defaultValue": "{{originalPlayer.civilization._}}", "ns": "civilization" })',
  'City.captured-by-us.title': 'City captured!',
  'City.captured-from-us.body':
    'Our city {{- city, cityName}} has been captured by $t(Generic.civilization-name.nation, { "civilization": "{{capturingPlayer.civilization._}}", "ns": "default" })!',
  'City.captured-from-us.title': 'City captured!',
  'City.abandoned.body':
    '{{- city, cityName}} has been abandoned as its Settlers set out.',
  'City.abandoned.title': 'City abandoned!',
  'City.destroyed.body': `{{- city, cityName}} has been destroyed!`,
  'City.destroyed.title': 'City destroyed!',
  'City.destroyed-by.body':
    'Our city {{- city, cityName}} has been destroyed by $t(Generic.civilization-name.nation, { "civilization": "{{player.civilization._}}", "ns": "default" })!',
  'City.destroyed-by.title': 'City destroyed!',
  'City.civil-disorder.body': `Civil disorder in {{- city, cityName}}. Mayor flees in panic!`,
  'City.civil-disorder.title': 'Civil disorder',
  // M2c's (#1007): a celebrating city that grows (Civ2's rapture growth), a captured city's plunder and Partisans, a
  //  Nuclear Plant's meltdown.
  'City.celebration-growth.body': `{{- city, cityName}} celebrates, and grows!`,
  'City.celebration-growth.title': 'City grows',
  'City.plundered.body': `{{amount, number}} gold was plundered from our treasury when {{- city, cityName}} was captured.`,
  'City.plundered.title': 'Treasury plundered',
  'City.plundered-by-us.body': `We plundered {{amount, number}} gold when we captured {{- city, cityName}}.`,
  'City.plundered-by-us.title': 'Gold plundered',
  'City.partisans.body': `Partisans rise up around {{- city, cityName}} to resist its capture!`,
  'City.partisans.title': 'Partisans',
  'City.partisans-against-us.body': `Partisans rise up around {{- city, cityName}} to resist our capture of it!`,
  'City.partisans-against-us.title': 'Partisans',
  'City.nuclear-meltdown.body': `The Nuclear Plant in {{- city, cityName}} has melted down in the civil disorder! The land around it is contaminated.`,
  'City.nuclear-meltdown.title': 'Nuclear meltdown!',
  'City.leader-celebration.body': `Leader celebration in {{- city, cityName}}!`,
  'City.leader-celebration.title': 'Leader celebration',
  'City.leader-celebration-ended.body': `Leader celebration canceled in {{- city, cityName}}!`,
  'City.leader-celebration-ended.title': 'Leader celebration',
  'City.order-restored.body': `Order restored in {{- city, cityName}}.`,
  'City.order-restored.title': 'Order restored!',
  'City.polluted.body': `Pollution near {{- city, cityName}}.`,
  'City.polluted.title': 'Pollution!',
  'City.sdi-protected.body': `SDI protects {{- city, cityName}}.`,
  'City.sdi-protected.title': 'SDI Defense',
  'City.unit-unsupported.body': `{{- city, cityName}} cannot support $t({{unit._}}.name, { "defaultValue": "{{unit._}}", "ns": "unit" }).`,
  'City.unit-unsupported.title': 'Unit not supported!',
  'City.improvement-unsupported.body': `{{- city, cityName}} cannot support $t(Improvement.{{cityImprovement._}}.name, { "defaultValue": "{{cityImprovement._}}", "ns": "city" }).`,
  'City.improvement-unsupported.title': 'Improvement not supported!',
  // A city that lost a citizen as its defender lost (M2b).
  'City.shrink-defender-lost.body': `{{- city, cityName}} lost population when its defender was defeated.`,
  'City.shrink-defender-lost.title': 'Population lost',
  'City.food-storage-exhausted.body': `Food storage exhausted in {{- city, cityName}}! Famine feared.`,
  'City.food-storage-exhausted.title': 'Food storage exhausted!',
  'City.food-storage-exhausted.unit-lost.body': `Food storage exhausted in {{- city, cityName}}! $t({{unit._}}.name, { "defaultValue": "{{unit._}}", "ns": "unit" }) lost.`,
  'City.food-storage-exhausted.unit-lost.title': 'Food storage exhausted!',
  'CityImprovement.obsolete.body':
    'Development of $t({{advance._}}.name, { "defaultValue": "{{advance._}}", "ns": "science" }) makes existing $t(Improvement.{{improvement}}.name, { "defaultValue": "{{improvement}}", "ns": "city" }) obsolete.',
  'CityImprovement.obsolete.title': 'Improvement obsolete',
  'GoodyHut.action-performed.Advance.body':
    'You have discovered scrolls of ancient wisdom...',
  'GoodyHut.action-performed.Advance.title': 'Exploration',
  'GoodyHut.action-performed.Barbarians.body':
    'You have unleashed a horde of barbarians!',
  'GoodyHut.action-performed.Barbarians.title': 'Exploration',
  'GoodyHut.action-performed.City.body':
    'You have discovered an advanced tribe...',
  'GoodyHut.action-performed.City.title': 'Exploration',
  // `amount` is the hut's gold: always 50 in Civilization, 25, 50 or 100, and later twice that, in Civilization II.
  'GoodyHut.action-performed.Gold.body':
    'You have discovered valuable treasure worth {{amount, number}} Gold.',
  'GoodyHut.action-performed.Gold.title': 'Exploration',
  // Civilization II's: a tribe that can't found a city joins you as a unit.
  'GoodyHut.action-performed.Nomads.body':
    'Nomads from the hut have joined your civilization.',
  'GoodyHut.action-performed.Nomads.title': 'Exploration',
  'GoodyHut.action-performed.Unit.body':
    'You have discovered a friendly tribe of skilled mercenaries...',
  'GoodyHut.action-performed.Unit.title': 'Exploration',
  // Talks the player asked for from the Foreign Advisor that the rules no longer allow (M2d).
  'Talks.refused.body':
    'Our emissary cannot reach $t(Generic.civilization-name.nation, { "civilization": "{{player.civilization._}}", "ns": "default" }) now: we are no longer in contact.',
  'Talks.refused.title': 'No talks',
  'Player.declaration-broken.body':
    'We have broken our $t(Declaration.{{declaration._}}, { "defaultValue": "{{declaration._}}", "ns": "diplomacy" }) with $t(Generic.civilization-name.nation, { "civilization": "{{enemy.civilization._}}", "ns": "default" }).',
  'Player.declaration-broken.title': 'Treaty broken',
  'Player.declaration-expired.body':
    'Our $t(Declaration.{{declaration._}}, { "defaultValue": "{{declaration._}}", "ns": "diplomacy" }) with $t(Generic.civilization-name.nation, { "civilization": "{{enemy.civilization._}}", "ns": "default" }) has been canceled!',
  'Player.declaration-expired.title':
    'Sneak attack by $t(Generic.civilization-name.nation, { "civilization": "{{enemy.civilization._}}", "ns": "default" })!',
  'Player.defeated.by.body':
    '$t(Generic.civilization-name.nation-start, { "civilization": "{{defeatedPlayer.civilization._}}", "ns": "default" }) has been defeated by $t(Generic.civilization-name.nation, { "civilization": "{{player.civilization._}}", "ns": "default" })!',
  'Player.defeated.by.title': 'Defeated!',
  'Player.defeated.unknown.body':
    '$t(Generic.civilization-name.nation-start, { "civilization": "{{defeatedPlayer.civilization._}}", "ns": "default" }) defeated!',
  'Player.defeated.unknown.title': 'Defeated!',
  'Player.defeated.unmet.body':
    'News reaches us that $t(Generic.unknown-civilization, { "ns": "default" }) has been defeated!',
  'Player.defeated.unmet.title': 'Defeated!',
  'Player.defeated.unmet-by.body':
    '$t(Generic.unknown-civilization-start, { "ns": "default" }) has been defeated by $t(Generic.civilization-name.nation, { "civilization": "{{player.civilization._}}", "ns": "default" })!',
  'Player.defeated.unmet-by.title': 'Defeated!',
  'Barbarians.landing.body':
    'Barbarian raiding party lands near {{- city, cityName}}! Citizens are alarmed.',
  'Barbarians.landing.title': 'Barbarians!',
  'Barbarians.ransom.body':
    'Barbarian leader captured! {{amount, number}} Gold ransom paid.',
  'Barbarians.ransom.title': 'Ransom',
  'Barbarians.uprising.body':
    'Travelers report: Barbarian uprising near {{- city, cityName}}!',
  'Barbarians.uprising.title': 'Barbarian uprising',
  'Barbarians.uprising.guerrilla.body':
    'Travelers report: Guerrilla uprising near {{- city, cityName}}!',
  'Barbarians.uprising.guerrilla.title': 'Guerrilla uprising',
  'Player.respawned.body':
    'Where $t(Generic.civilization-name.nation, { "civilization": "{{defeatedPlayer.civilization._}}", "ns": "default" }) once stood, a new civilization has arisen.',
  'Player.respawned.title': 'A new civilization',
  'Player.respawned.unmet.body':
    'Travelers tell of a new civilization arising in a distant land.',
  'Player.respawned.unmet.title': 'A new civilization',
  'Player.government-collapsed.body': `Civil disorder in {{- city, cityName}} has brought down your Democracy! Your civilization falls into Anarchy.`,
  'Player.government-collapsed.title': 'Government falls!',
  'Player.government-collapsed.pyramids.body': `Civil disorder in {{- city, cityName}} has brought down your Democracy! Thanks to the Pyramids, you can choose a new government straight away.`,
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
  'Diplomat.incited.body': `$t({{originalPlayer.civilization._}}.plural, { "defaultValue": "{{originalPlayer.civilization._}}", "ns": "civilization" }) rebel! Civil War in {{- city, cityName}}. $t({{inciter.civilization._}}.name, { "defaultValue": "{{inciter.civilization._}}", "ns": "civilization" }) influence suspected.`,
  'Diplomat.incited.title': 'Civil war!',
  'Diplomat.sabotaged.improvement.body': `$t(Improvement.{{improvement}}.name, { "defaultValue": "{{improvement}}", "ns": "city" }) destroyed in {{- city, cityName}}.`,
  'Diplomat.sabotaged.improvement.title': 'Industrial sabotage!',
  'Diplomat.sabotaged.production.body': `Production sabotaged in {{- city, cityName}}.`,
  'Diplomat.sabotaged.production.title': 'Industrial sabotage!',
  'Diplomat.sabotaged.production.unit.body': `$t({{build._}}.name, { "defaultValue": "{{build._}}", "ns": "unit" }) production sabotaged in {{- city, cityName}}.`,
  'Diplomat.sabotaged.production.unit.title': 'Industrial sabotage!',
  'Diplomat.sabotaged.production.city-improvement.body': `$t(Improvement.{{build._}}.name, { "defaultValue": "{{build._}}", "ns": "city" }) production sabotaged in {{- city, cityName}}.`,
  'Diplomat.sabotaged.production.city-improvement.title':
    'Industrial sabotage!',
  'Diplomat.sabotaged.production.wonder.body': `$t({{build._}}.name, { "defaultValue": "{{build._}}", "ns": "wonder" }) production sabotaged in {{- city, cityName}}.`,
  'Diplomat.sabotaged.production.wonder.title': 'Industrial sabotage!',
  'Diplomat.sabotaged.production.spaceship-part.body': `$t({{build._}}.name, { "defaultValue": "{{build._}}", "ns": "spaceship" }) production sabotaged in {{- city, cityName}}.`,
  'Diplomat.sabotaged.production.spaceship-part.title': 'Industrial sabotage!',
  'Diplomat.unit-bribed.body': `$t({{previousOwner.civilization._}}.name, { "defaultValue": "{{previousOwner.civilization._}}", "ns": "civilization" }) $t({{unit}}.name, { "defaultValue": "{{unit}}", "ns": "unit" }) unit bribed by $t({{briber.civilization._}}.plural, { "defaultValue": "{{briber.civilization._}}", "ns": "civilization" })!`,
  'Diplomat.unit-bribed.title': 'Unit bribed!',
  // M2b's (#1007): an airlift shot down, by a player met or not (#59), a missile defense's stop told to the missile's
  //  player and to everyone else, and a unit promoted after a win.
  'Unit.airlift-shot-down.body': `Our $t({{unit._}}.name, { "defaultValue": "{{unit._}}", "ns": "unit" }) was shot down by $t(Generic.civilization-name.nation, { "civilization": "{{player.civilization._}}", "ns": "default" }) while being airlifted.`,
  'Unit.airlift-shot-down.title': 'Airlift shot down!',
  'Unit.airlift-shot-down.unmet.body': `Our $t({{unit._}}.name, { "defaultValue": "{{unit._}}", "ns": "unit" }) was shot down while being airlifted.`,
  'Unit.airlift-shot-down.unmet.title': 'Airlift shot down!',
  'Unit.nuclear-stopped.body':
    'A nuclear attack by $t(Generic.civilization-name.nation, { "civilization": "{{player.civilization._}}", "ns": "default" }) was stopped by SDI Defense.',
  'Unit.nuclear-stopped.title': 'Nuclear attack stopped',
  'Unit.nuclear-stopped.ours.body': `Our $t({{unit._}}.name, { "defaultValue": "{{unit._}}", "ns": "unit" }) was stopped by SDI Defense and lost.`,
  'Unit.nuclear-stopped.ours.title': 'Nuclear attack stopped',
  'Unit.promoted.body': `Our $t({{unit._}}.name, { "defaultValue": "{{unit._}}", "ns": "unit" }) has been promoted to veteran.`,
  'Unit.promoted.title': 'Promoted to veteran',
  'Unit.lost-at-sea.body': `Our $t({{unit._}}.name, { "defaultValue": "{{unit._}}", "ns": "unit" }) was lost at sea.`,
  'Unit.lost-at-sea.title': 'Unit lost at sea!',
  'Unit.trade-route-established.body': `$t(TradeRoute.goods.{{goods}}, { "defaultValue": "{{goods}}", "ns": "default" }) caravan from {{- home, cityName}} arrives in {{- city, cityName}}. The goods sold for {{bonus, number}} coins.`,
  'Unit.trade-route-established.title': 'Trade route established',
  'Unit.nuclear-attack.body':
    'Nuclear weapons have been used by $t(Generic.civilization-name.nation, { "civilization": "{{player.civilization._}}", "ns": "default" })!',
  'Unit.nuclear-attack.title': 'Nuclear attack!',
  'Unit.out-of-fuel.body': `Our $t({{unit._}}.name, { "defaultValue": "{{unit._}}", "ns": "unit" }) ran out of fuel and crashed.`,
  'Unit.out-of-fuel.title': 'Out of fuel!',
  // M2c's (#1007): units upgraded in place, one notice for each old type.
  'Unit.upgraded.body': `Our $t({{from._}}.name, { "defaultValue": "{{from._}}", "ns": "unit" }) units have been upgraded to $t({{to._}}.name, { "defaultValue": "{{to._}}", "ns": "unit" }).`,
  'Unit.upgraded.title': 'Units upgraded',
  'Wonder.building-complete.other-player.known.body':
    '{{- city, cityName}} has completed work on $t({{build._}}.name, { "defaultValue": "{{build._}}", "ns": "wonder" })!',
  'Wonder.building-complete.other-player.known.title': 'Wonder completed',
  'Wonder.building-complete.other-player.unknown.body':
    'A far away city has completed work on $t({{build._}}.name, { "defaultValue": "{{build._}}", "ns": "wonder" })!',
  'Wonder.building-complete.other-player.unknown.title': 'Wonder completed',
  'Wonder.obsolete.body':
    '$t({{wonder._}}.name, { "defaultValue": "{{wonder._}}", "ns": "wonder" }) in {{- city, cityName}} is now obsolete.',
  'Wonder.obsolete.title': 'Wonder obsolete',
  // M2c's (#1007): a Wonder that shows every player the whole map, ours, a met player's or an unmet one's.
  'Wonder.apollo-revealed.body':
    '$t(Generic.civilization-name.nation, { "civilization": "{{player.civilization._}}", "ns": "default" }) $t({{wonder._}}.name, { "defaultValue": "{{wonder._}}", "ns": "wonder" }) has revealed the whole world to every civilization.',
  'Wonder.apollo-revealed.title': 'The world revealed',
  'Wonder.apollo-revealed.ours.body':
    'Our $t({{wonder._}}.name, { "defaultValue": "{{wonder._}}", "ns": "wonder" }) in {{- city, cityName}} has revealed the whole world to every civilization.',
  'Wonder.apollo-revealed.ours.title': 'The world revealed',
  'Wonder.apollo-revealed.unmet.body':
    'A far away civilization’s $t({{wonder._}}.name, { "defaultValue": "{{wonder._}}", "ns": "wonder" }) has revealed the whole world to every civilization.',
  'Wonder.apollo-revealed.unmet.title': 'The world revealed',
});
