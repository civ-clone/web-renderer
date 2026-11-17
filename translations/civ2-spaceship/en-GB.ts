import i18next from 'i18next';

// A spaceship's launch (M2e), as en-GB has it where it differs from en.
i18next.addResources('en-GB', 'notification', {
  'Spaceship.launched.unmet.body':
    'A civilisation we have never met has launched a spaceship for Alpha Centauri, due to arrive in {{year, number(useGrouping: false)}}.',
});
