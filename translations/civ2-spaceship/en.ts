import i18next from 'i18next';

// A spaceship's launch under Civilization II's rules (M2e, #1008), in our own words: news for every civilization, with
//  the year the ship is due. A ship lost or landed is told by the shared notices. Its parts keep the shared names
//  (`civ1-spaceship`'s, the same six kinds).
const nation = (path: string): string =>
  `$t(Generic.civilization-name.plural, { "civilization": "{{${path}.civilization._}}", "ns": "default" })`;

i18next.addResources('en', 'notification', {
  'Spaceship.launched-by-us.title': 'Launch!',
  'Spaceship.launched-by-us.body':
    'Our spaceship has lifted off for Alpha Centauri, and should arrive in {{year, number(useGrouping: false)}}.',
  'Spaceship.launched.title': 'Spaceship launched',
  'Spaceship.launched.body': `The ${nation(
    'player'
  )} have launched a spaceship for Alpha Centauri, due to arrive in {{year, number(useGrouping: false)}}.`,
  'Spaceship.launched.unmet.title': 'Spaceship launched',
  'Spaceship.launched.unmet.body':
    'A civilization we have never met has launched a spaceship for Alpha Centauri, due to arrive in {{year, number(useGrouping: false)}}.',
});
