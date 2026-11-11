import i18next from 'i18next';

// British spellings of `en.ts`'s rule set names and descriptions (#954). SDI Defence is named as in
//  `translations/civ1-city-improvement/en-GB.ts`.
i18next.addResources('en-GB', 'ruleset', {
  'civ1-enhanced.pollution-in-every-city.name':
    'Every civilisation’s cities can cause pollution',
  'civ1-enhanced.barbarian-city-builds.name':
    'Barbarian cities build any attacking land unit that at least two civilisations can build',
  'civ1-enhanced.barbarian-uprisings.name':
    'Any civilisation’s cities can set off a Barbarian uprising',
  'civ1-enhanced.sdi-defense-spares-cities.name':
    'SDI Defence spares its city from a nuclear attack',
  'civ1-enhanced.sdi-defense-spares-cities.description':
    'In the original, SDI Defence only saves the units inside, and the city is still halved.',
});
