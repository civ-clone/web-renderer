// The reports package's own text, as en-GB has it where it differs from en (#825).
import i18next from 'i18next';

i18next.addResources('en-GB', 'default', {
  'Civilopedia.section.advance': 'Civilisation Advances',
  'Civilopedia.kind.advance': 'Civilisation Advance',
  'Civilopedia.stats':
    'Attack: {{attack, number}} · Defence: {{defense, number}} · Moves: {{movement, number}}',
  'Civilopedia.world.requires': '{{line}}, built by any civilisation',
  'Civilopedia.world.obsoletedBy': '{{line}}, once any civilisation has it',
  'Civilopedia.world.other': '{{line}}, for any civilisation',
  'CivilizationScoreReport.title': 'Civilisation Score',
  'GameOver.destroyed.title': 'Your civilisation is destroyed',
  'GameOver.rating':
    'Sire, your Civilisation Rating of {{rating}}% exceeds even that of {{famousLeader}}!',
  'GameOver.rating_none': 'Sire, your Civilisation Rating is {{rating}}%.',
  'GameOver.score': 'Civilisation Score: {{score, number}}',
  'GameOver.spaceship.body_unknown':
    'A civilisation we have never met has reached Alpha Centauri first. The stars will have to wait for the {{nation}}.',
  'HallOfFame.column.civilization': 'Civilisation',
  'IntelligenceReport.empty': 'We have not met any other civilisations yet.',
  'IntelligenceReport.no-foreign-affairs':
    'No contact with other civilisations.',
  'IntelligenceReport.trait.Civilized': 'Civilised',
});
