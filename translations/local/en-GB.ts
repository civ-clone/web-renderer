import i18next from 'i18next';

i18next.addResources('en-GB', 'default', {
  'Generic.unknown-civilization': 'an unknown civilisation',

  'Actions.Revolution.body':
    'Overthrow your government? Your civilisation will fall into Anarchy for a few turns before you can choose a new one, unless you have the Pyramids.',

  'ChooseFromList.choose-civilization.title': 'Choose your civilisation',

  'CustomizeWorld.title': 'Customise world',

  'Game.progress.unmet-player': 'An unknown civilisation is moving…',
  'Game.waiting': 'Waiting for the other civilisations…',

  'GameMenu.retire-confirm':
    'Retiring ends the game now, and you see your Civilisation Score. You can keep playing afterwards, but nothing more is scored.',
  'GameMenu.civilization-score': 'Civilisation Score',

  'GameSetup.civilization': 'Civilisation',

  'ImportAssetsWindow.brave':
    '<p>It looks like you\'re using Brave and due to the use of <code>HTMLCanvasElement</code>\'s <code>getImageData</code> and <code>toDataURL</code> functions, please put Shields down while importing, and playing, otherwise any colour-replaced icons won\'t look correct. <strong>Remember to put them back up after!</strong></p><p><a href="https://brave.com/privacy-updates/4-fingerprinting-defenses-2.0/#2-fingerprinting-protections-20-farbling-for-great-good" target="_blank">Read more about "farbling".</a></p>',
  'ImportAssetsWindow.done':
    'Done! Please reload the page to utilise the fresh assets.',

  'MainMenu.customise': 'Customise…',

  'NewGameWindow.civilizations_one': '1 civilisation',
  'NewGameWindow.civilizations_other': '{{count}} civilisations',

  'IntelligenceReport.empty': 'We have not met any other civilisations yet.',
  'IntelligenceReport.no-foreign-affairs':
    'No contact with other civilisations.',
  'IntelligenceReport.trait.Civilized': 'Civilised',

  'CivilizationScoreReport.title': 'Civilisation Score',

  'Window.maximize': 'Maximise',
  'Window.minimize': 'Minimise',

  'GameOver.destroyed.title': 'Your civilisation is destroyed',
  'GameOver.rating':
    'Sire, your Civilisation Rating of {{rating}}% exceeds even that of {{famousLeader}}!',
  'GameOver.rating_none': 'Sire, your Civilisation Rating is {{rating}}%.',
  'GameOver.score': 'Civilisation Score: {{score}}',
  'GameOver.spaceship.body_unknown':
    'A civilisation we have never met has reached Alpha Centauri first. The stars will have to wait for the {{nation}}.',

  'HallOfFame.column.civilization': 'Civilisation',
});

i18next.addResources('en-GB', 'notification', {
  'City.leader-celebration-ended.body': `Leader celebration cancelled in $t(Generic.city-name, { "civilization": "{{city.originalPlayer.civilization._}}", "name": "{{- city.name}}", "ns": "default" })!`,
  'City.sdi-protected.title': 'SDI Defence',
  'Player.declaration-expired.body':
    'Our $t(Declaration.{{declaration._}}, { "defaultValue": "{{declaration._}}", "ns": "diplomacy" }) with $t(Generic.civilization-name.nation, { "civilization": "{{enemy.civilization._}}", "ns": "default" }) has been cancelled!',
  'Barbarians.uprising.body':
    'Travellers report: Barbarian uprising near $t(Generic.city-name, { "civilization": "{{city.originalPlayer.civilization._}}", "name": "{{- city.name}}", "ns": "default" })!',
  'Barbarians.uprising.guerrilla.body':
    'Travellers report: Guerrilla uprising near $t(Generic.city-name, { "civilization": "{{city.originalPlayer.civilization._}}", "name": "{{- city.name}}", "ns": "default" })!',
  'Player.respawned.body':
    'Where $t(Generic.civilization-name.nation, { "civilization": "{{defeatedPlayer.civilization._}}", "ns": "default" }) once stood, a new civilisation has arisen.',
  'Player.respawned.title': 'A new civilisation',
  'Player.respawned.unmet.body':
    'Travellers tell of a new civilisation arising in a distant land.',
  'Player.respawned.unmet.title': 'A new civilisation',
  'Player.government-collapsed.body': `Civil disorder in $t(Generic.city-name, { "civilization": "{{city.originalPlayer.civilization._}}", "name": "{{- city.name}}", "ns": "default" }) has brought down your Democracy! Your civilisation falls into Anarchy.`,
  'Spaceship.cancelled.body':
    '$t(Generic.civilization-name.name, { "civilization": "{{player.civilization._}}", "ns": "default" }) spaceship construction cancelled.',
  'Spaceship.cancelled.title': 'Spaceship cancelled',
});
