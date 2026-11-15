// The protocol package's own text, as en-GB has it where it differs from en (#825).
import i18next from 'i18next';

i18next.addResources('en-GB', 'default', {
  'Generic.unknown-civilization': 'an unknown civilisation',
  'Game.progress.unmet-player': 'An unknown civilisation is moving…',
});

i18next.addResources('en-GB', 'notification', {
  'City.leader-celebration-ended.body': `Leader celebration cancelled in {{- city, cityName}}!`,
  'City.sdi-protected.title': 'SDI Defence',
  'Unit.nuclear-stopped.body':
    'A nuclear attack by $t(Generic.civilization-name.nation, { "civilization": "{{player.civilization._}}", "ns": "default" }) was stopped by SDI Defence.',
  'Unit.nuclear-stopped.ours.body': `Our $t({{unit._}}.name, { "defaultValue": "{{unit._}}", "ns": "unit" }) was stopped by SDI Defence and lost.`,
  'Player.declaration-expired.body':
    'Our $t(Declaration.{{declaration._}}, { "defaultValue": "{{declaration._}}", "ns": "diplomacy" }) with $t(Generic.civilization-name.nation, { "civilization": "{{enemy.civilization._}}", "ns": "default" }) has been cancelled!',
  'Barbarians.uprising.body':
    'Travellers report: Barbarian uprising near {{- city, cityName}}!',
  'Barbarians.uprising.guerrilla.body':
    'Travellers report: Guerrilla uprising near {{- city, cityName}}!',
  'Player.respawned.body':
    'Where $t(Generic.civilization-name.nation, { "civilization": "{{defeatedPlayer.civilization._}}", "ns": "default" }) once stood, a new civilisation has arisen.',
  'Player.respawned.title': 'A new civilisation',
  'Player.respawned.unmet.body':
    'Travellers tell of a new civilisation arising in a distant land.',
  'Player.respawned.unmet.title': 'A new civilisation',
  'Player.government-collapsed.body': `Civil disorder in {{- city, cityName}} has brought down your Democracy! Your civilisation falls into Anarchy.`,
  'Spaceship.cancelled.body':
    '$t(Generic.civilization-name.name, { "civilization": "{{player.civilization._}}", "ns": "default" }) spaceship construction cancelled.',
  'Spaceship.cancelled.title': 'Spaceship cancelled',
});
