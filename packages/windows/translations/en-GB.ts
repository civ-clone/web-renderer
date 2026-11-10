// The windows package's own text, as en-GB has it where it differs from en (#825).
import i18next from 'i18next';

i18next.addResources('en-GB', 'default', {
  'ChoiceWindow.ChooseFromList.choose-civilization.random':
    'Play as a random civilisation',
  'GameOptions.colour-scheme': 'Colours',
  'Game.waiting': 'Waiting for the other civilisations…',
  'NextTurn.waiting.unmet-player': 'Waiting for an unknown civilisation…',
  'GameMenu.retire-confirm':
    'Retiring ends the game now, and you see your Civilisation Score. You can keep playing afterwards, but nothing more is scored.',
  'GameMenu.civilization-score': 'Civilisation Score',
  'UnitCard.defence-bonus':
    '+{{bonus, number(style: percent; maximumFractionDigits: 0)}} defence',
  'UnitCard.defence-bonus.title': 'Defence bonus',
  'GameSetup.civilization': 'Civilisation',
  'ResumeGame.intro':
    'Who plays each civilisation? Take over a computer seat, or hand yours to the computer, before the game goes on.',
  'ImportAssetsWindow.brave':
    '<p>It looks like you\'re using Brave and due to the use of <code>HTMLCanvasElement</code>\'s <code>getImageData</code> and <code>toDataURL</code> functions, please put Shields down while importing, and playing, otherwise any colour-replaced icons won\'t look correct. <strong>Remember to put them back up after!</strong></p><p><a href="https://brave.com/privacy-updates/4-fingerprinting-defenses-2.0/#2-fingerprinting-protections-20-farbling-for-great-good" target="_blank">Read more about "farbling".</a></p>',
  'ImportAssetsWindow.done':
    'Done! Please reload the page to utilise the fresh assets.',
  'NewGameWindow.customize': 'Customise…',
  'NewGameWindow.customize-meta':
    'Choose the civilisations, seats, rules and the exact world',
  'IntelligenceReport.empty': 'We have not met any other civilisations yet.',
  'IntelligenceReport.no-foreign-affairs':
    'No contact with other civilisations.',
  'IntelligenceReport.trait.Civilized': 'Civilised',
});
