import i18next from 'i18next';

// A civil war under Civilization II's rules (M2e, #1008), in our own words: told to the civilization that split, with
//  how many cities left it, and to everyone who has met it. Rebels not yet met aren't named (#59).
const the = (path: string): string =>
  `the $t(Generic.civilization-name.plural, { "civilization": "{{${path}.civilization._}}", "ns": "default" })`;

i18next.addResources('en', 'notification', {
  'Player.civil-war-ours.title': 'Civil war!',
  'Player.civil-war-ours.body_one': `Our capital has fallen and the empire is torn apart: a city has broken away to join ${the(
    'rebels'
  )}.`,
  'Player.civil-war-ours.body_other': `Our capital has fallen and the empire is torn apart: {{count, number}} cities have broken away to join ${the(
    'rebels'
  )}.`,
  'Player.civil-war-ours.unmet.title': 'Civil war!',
  'Player.civil-war-ours.unmet.body_one':
    'Our capital has fallen and the empire is torn apart: a city has broken away under a new flag.',
  'Player.civil-war-ours.unmet.body_other':
    'Our capital has fallen and the empire is torn apart: {{count, number}} cities have broken away under a new flag.',
  'Player.civil-war.title': 'Civil war',
  'Player.civil-war.body': `With their capital lost, ${the(
    'loser'
  )} have split in civil war, and ${the('rebels')} rise from the ruins.`,
  'Player.civil-war.unmet.title': 'Civil war',
  'Player.civil-war.unmet.body': `With their capital lost, ${the(
    'loser'
  )} have split in civil war, and a new civilization rises from the ruins.`,
});
