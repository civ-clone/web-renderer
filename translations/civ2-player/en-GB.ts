import i18next from 'i18next';

// A civil war (M2e), as en-GB has it where it differs from en.
const the = (path: string): string =>
  `the $t(Generic.civilization-name.plural, { "civilization": "{{${path}.civilization._}}", "ns": "default" })`;

i18next.addResources('en-GB', 'notification', {
  'Player.civil-war.unmet.body': `With their capital lost, ${the(
    'loser'
  )} have split in civil war, and a new civilisation rises from the ruins.`,
});
