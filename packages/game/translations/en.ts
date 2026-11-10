// The game package's own text (#825).
import i18next from 'i18next';

i18next.addResources('en', 'default', {
  'GameMenu.cheat.enabled': 'Cheat mode enabled',
  'JoinCity.too-large.body':
    '{{- city}} is too large for Settlers to join. Only cities smaller than size {{size}} can be joined.',
  'JoinCity.too-large.title': 'City too large',
  'Meeting.title': 'Meeting with {{- leader}}',
  // The talks' lines, each with who said it, and the button that says the player's one answer (#751).
  'Negotiation.continue': 'Continue',
  'Negotiation.speaker': '{{- speaker}}:',
  'Observer.watching': 'Watching: the computer players are taking their turns…',
  'ReloadGuard.body': 'Are you sure you want to reload?',
  'ReloadGuard.title': 'Reload',
  'SavedGame.could-not-load':
    'That save could not be loaded, so you are back at the main menu: {{- error}}',
  'SavedGame.downloaded-instead':
    'The browser would not keep your save ({{- error}}), so it has been downloaded instead.',
  'SavedGame.saved': 'Saved in this browser: {{- name}}',
  // The sidebar's sections, which can be collapsed (#697).
  'Sidebar.cities': 'Cities',
  'Sidebar.power': 'Power',
  'Sidebar.unit': 'Active Unit',
  'Sidebar.world': 'World',
  'StartFailure.body':
    'The game could not start. Reload the page to try again.',
  'StartFailure.reload': 'Reload',
  'Welcome.you-have-risen':
    '$t(Generic.leader-name, { "leader": "{{player.civilization.leader._}}", "ns": "default" }), you have risen to become leader of $t(Generic.civilization-name.nation, { "civilization": "{{player.civilization._}}", "ns": "default" }).',
  'Welcome.your-people-have-knowledge-of':
    'Your people have knowledge of {{advances, list}}.',
  'WorkerFailure.body':
    'Something went wrong in the game. It may carry on; if nothing happens, reload the page.',
  'WorkerFailure.not-answering':
    'The game has stopped answering. It may be busy and carry on; if nothing happens, reload the page.',
  'WorkerFailure.title': 'Something went wrong',
  'ChoiceWindow.ChooseFromList.capture-city.steal-advance.primary':
    'Acquire {{- choice}}',
  'ChoiceWindow.ChooseFromList.choose-civilization.primary':
    'Play as the {{- choice}}',
  'ChoiceWindow.ChooseFromList.choose-civilization.random':
    'Play as a random civilization',
  'ChoiceWindow.ChooseFromList.choose-leader.primary': 'Play as {{- choice}}',
  'ChoiceWindow.ChooseFromList.diplomacy.exchange-knowledge.primary':
    'Take {{- choice}}',
  'GameMenu.cheat.choose-advances': 'Advances',
  'GameMenu.cheat.click-map': 'Click the map to fill in the coordinates.',
  'GameMenu.cheat.create': 'Create',
  'GameMenu.cheat.create-unit': 'Create Unit',
  'GameMenu.cheat.enter-gold-amount': 'Enter the amount of gold',
  'GameMenu.cheat.grant': 'Grant',
  'GameMenu.cheat.grant-advance': 'Grant Advance',
  'GameMenu.cheat.grant-gold': 'Grant Gold',
  'GameMenu.cheat.no-advances': 'None available',
  'GameMenu.cheat.player': 'Player',
  'GameMenu.cheat.reveal-map': 'Reveal Map',
  'GameMenu.cheat.unit-type': 'Unit type',
  'GameMenu.cheat.x': 'X',
  'GameMenu.cheat.y': 'Y',
  'GameMenu.cheat.you': 'You',
});
