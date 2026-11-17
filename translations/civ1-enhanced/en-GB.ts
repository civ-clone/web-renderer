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
  'civ1-enhanced.ages.name':
    'Civilisations move through eight ages as they learn',
  'civ1-enhanced.ages.description':
    'A civilisation enters a new age, from the Ancient Age to the Space Age, with the first advance it learns from a later research tier, and you are told when yours does. The original has no ages.',
  'civ1-enhanced.research-cost-by-age.description':
    'Research costs half as much in the Ancient Age, rising with each age to three times in the Space Age, and a civilisation’s costs rise once it is in the Renaissance if the leader is ahead of schedule. Rushing ahead makes research dearer from then on, even for the advances you skipped. In the original, research costs double from 1 AD, and rise for everyone from then on if the leader is ahead of schedule.',
});
