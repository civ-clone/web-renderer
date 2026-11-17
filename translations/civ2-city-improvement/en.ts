import i18next from 'i18next';

// Civilization II's city improvements that Civilization has none of (M2a, #1008), by their class names.
i18next.addResources('en', 'city', {
  'Improvement.Airport.name': 'Airport',
  'Improvement.Capitalization.name': 'Capitalization',
  'Improvement.CoastalFortress.name': 'Coastal Fortress',
  'Improvement.Harbour.name': 'Harbor',
  'Improvement.OffshorePlatform.name': 'Offshore Platform',
  'Improvement.PoliceStation.name': 'Police Station',
  'Improvement.PortFacility.name': 'Port Facility',
  'Improvement.ResearchLab.name': 'Research Lab',
  'Improvement.SamMissileBattery.name': 'SAM Missile Battery',
  'Improvement.SewerSystem.name': 'Sewer System',
  'Improvement.SolarPlant.name': 'Solar Plant',
  'Improvement.StockExchange.name': 'Stock Exchange',
  'Improvement.Superhighways.name': 'Superhighways',
  'Improvement.Supermarket.name': 'Supermarket',
});

// Capitalization (M2c), which a city builds for good, its shields going to the treasury as gold: what the build list and
//  the city screen say in place of the turns it would take (`City.Build.Held.*`, #959), by its rule's id.
i18next.addResources('en', 'default', {
  'City.Build.Held.waiting.civ2-city-improvement.city.hold.capitalization':
    'Shields become gold',
  'City.Build.Held.cannot-complete.civ2-city-improvement.city.hold.capitalization':
    'Never completes: shields become gold',
  'City.Build.Held.purchase.civ2-city-improvement.city.hold.capitalization':
    '{{- item}} never completes, so it can’t be bought.',
});

// Global warming under Civilization II's rules (M2e, #1008), in our own words: news for every civilization. A warming
//  says how many of the squares we know it changed.
i18next.addResources('en', 'notification', {
  'World.global-warming-warning.title': 'The climate is changing',
  'World.global-warming-warning.body':
    'Our scientists warn that pollution is heating the world. Unless it is cleaned up, the seas will rise and the land will dry out.',
  'World.global-warming.title': 'Global warming',
  'World.global-warming.body_one':
    'The world has grown warmer. Coasts have sunk into swamp and jungle and inland fields have dried out: one square we know has changed.',
  'World.global-warming.body_other':
    'The world has grown warmer. Coasts have sunk into swamp and jungle and inland fields have dried out: {{count, number}} squares we know have changed.',
  'World.global-warming.unseen.title': 'Global warming',
  'World.global-warming.unseen.body':
    'The world has grown warmer, changing coasts and fields in lands we have yet to see.',
});
