import i18next from "i18next";

i18next.addResources(
  'en',
  'wonder',
  {
    'ApolloProgram.name': 'Apollo Program',
    'Colossus.name': 'Colossus',
    'CopernicusObservatory.name': 'Copernicus Observatory',
    'CureForCancer.name': 'Cure for Cancer',
    'DarwinsVoyage.name': "Darwin's Voyage",
    'GreatLibrary.name': 'Great Library',
    'GreatWall.name': 'Great Wall',
    'HangingGardens.name': 'Hanging Gardens',
    'HooverDam.name': 'Hoover Dam',
    'IsaacNewtonsCollege.name': "Isaac Newton's College",
    'JsBachsCathedral.name': "J. S. Bach's Cathedral",
    'Lighthouse.name': 'Lighthouse',
    'MagellansExpedition.name': "Magellan's Expedition",
    'ManhattanProject.name': 'Manhattan Project',
    'MichelangelosChapel.name': "Michelangelo's Chapel",
    'Oracle.name': 'Oracle',
    'Pyramids.name': 'Pyramids',
    'SetiProgram.name': 'SETI Program',
    'ShakespearesTheatre.name': "Shakespeare's Theatre",
    'UnitedNations.name': 'United Nations',
    'WomensSuffrage.name': "Women's Suffrage",
  }
);

// The Hoover Dam's plant rules (#965), in the Civilopedia and the Can't build window. Their entries are `excludedBy`,
//  range `player`, which would read "Can't be built alongside Hoover Dam", but the dam only rules a plant out in its
//  owner's cities on its own continent, so each has wording of its own, keyed by its id with `:` and `/` as `.`
//  (`ruleKey` in `packages/reports/components/lib/requirements.ts`).
i18next.addResources('en', 'default', {
  'Civilopedia.rule.civ1-wonder.city.build.hoover-dam-plant.PowerPlant.subject':
    'Can’t be built by the owner of {{targets}} in a city on its continent',
  'Civilopedia.rule.civ1-wonder.city.build.hoover-dam-plant.PowerPlant.target':
    'Rules out {{subject}} in its owner’s cities on its continent',
  'Civilopedia.rule.civ1-wonder.city.build.hoover-dam-plant.HydroPlant.subject':
    'Can’t be built by the owner of {{targets}} in a city on its continent',
  'Civilopedia.rule.civ1-wonder.city.build.hoover-dam-plant.HydroPlant.target':
    'Rules out {{subject}} in its owner’s cities on its continent',
  'Civilopedia.rule.civ1-wonder.city.build.hoover-dam-plant.NuclearPlant.subject':
    'Can’t be built by the owner of {{targets}} in a city on its continent',
  'Civilopedia.rule.civ1-wonder.city.build.hoover-dam-plant.NuclearPlant.target':
    'Rules out {{subject}} in its owner’s cities on its continent',
});
