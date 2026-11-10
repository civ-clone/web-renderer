// The menus package's own text, as en-GB has it where it differs from en (#825).
import i18next from 'i18next';

i18next.addResources('en-GB', 'default', {
  'GameOptions.colour-scheme': 'Colours',
  'GameMenu.retire-confirm':
    'Retiring ends the game now, and you see your Civilisation Score. You can keep playing afterwards, but nothing more is scored.',
  'GameMenu.civilization-score': 'Civilisation Score',
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
});
