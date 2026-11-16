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
