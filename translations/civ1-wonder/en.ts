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

// The Wonders of the World report's sentences (#992): as Civ1 words them, the first seven are "The Pyramids of Thebes."
//  and "The Colossus (Destroyed)", where the rest are "Hoover Dam in Washington." (`WondersReport.wonder` and
//  `WondersReport.place` in the classic interface's text).
i18next.addResources('en', 'default', {
  'WondersReport.wonder_Pyramids': 'The {{- wonder}}',
  'WondersReport.place_Pyramids': 'The {{- wonder}} of {{- city}}',
  'WondersReport.wonder_HangingGardens': 'The {{- wonder}}',
  'WondersReport.place_HangingGardens': 'The {{- wonder}} of {{- city}}',
  'WondersReport.wonder_Colossus': 'The {{- wonder}}',
  'WondersReport.place_Colossus': 'The {{- wonder}} of {{- city}}',
  'WondersReport.wonder_Lighthouse': 'The {{- wonder}}',
  'WondersReport.place_Lighthouse': 'The {{- wonder}} of {{- city}}',
  'WondersReport.wonder_GreatLibrary': 'The {{- wonder}}',
  'WondersReport.place_GreatLibrary': 'The {{- wonder}} of {{- city}}',
  'WondersReport.wonder_Oracle': 'The {{- wonder}}',
  'WondersReport.place_Oracle': 'The {{- wonder}} of {{- city}}',
  'WondersReport.wonder_GreatWall': 'The {{- wonder}}',
  'WondersReport.place_GreatWall': 'The {{- wonder}} of {{- city}}',
});

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
