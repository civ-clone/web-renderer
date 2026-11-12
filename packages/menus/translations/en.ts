// The menus package's own text (#825).
import i18next from 'i18next';

i18next.addResources('en', 'default', {
  'ChoiceWindow.ChooseFromList.choose-difficulty.primary':
    'Play at {{- choice}} level',
  'ChoiceWindow.NewGame.start': 'Start with {{- players}}',
  'CustomizeWorld.height': '$t(Generic.height)',
  'CustomizeWorld.land-coverage': 'Land coverage',
  'CustomizeWorld.land-size': 'Land size',
  'CustomizeWorld.max-iterations': 'Max iterations',
  'CustomizeWorld.width': '$t(Generic.width)',
  'DifficultyWindow.title': 'Difficulty level',
  'GameMenu.city-status': 'City Status',
  'GameMenu.find-city': 'Find City',
  'GameMenu.happiness-report': 'Happiness Report',
  'GameMenu.intelligence-report': 'Intelligence Report',
  'GameMenu.label': 'Game menu',
  'GameMenu.load-game': 'Load Game',
  'GameMenu.load-game-confirm':
    'Loading a saved game will end the game in progress. Any unsaved progress will be lost.',
  'GameMenu.military-report': 'Military Report',
  'GameMenu.options': 'Options',
  'GameMenu.quit': 'Quit',
  'GameMenu.quit-confirm':
    'Quitting will end the game in progress and return to the main menu. Any unsaved progress will be lost.',
  'GameMenu.retire': 'Retire',
  'GameMenu.retire-confirm':
    'Retiring ends the game now, and you see your Civilization Score. You can keep playing afterwards, but nothing more is scored.',
  'GameMenu.save-game': 'Save Game',
  'GameMenu.save-name': 'The {{player}}, turn {{turn}}, {{date}}',
  'GameMenu.science-report': 'Science Report',
  'GameMenu.top-cities': 'Top Cities in the World',
  'GameMenu.civilization-score': 'Civilization Score',
  'GameMenu.civilopedia': 'Civilopedia',
  'GameMenu.trade-report': 'Trade Report',
  'GameMenu.wonders-report': 'Wonders of the World',
  'GameOptions.title': '$t(GameMenu.options)',
  'GameOptions.auto-end-turn': 'Auto End of Turn?',
  // The new interface's Assets row (#749): whether the tileset's sprites are imported, and the import.
  'GameOptions.assets': 'Assets',
  'GameOptions.assets-checking': 'Checking…',
  'GameOptions.assets-imported':
    '{{tileset}} assets imported · {{count, number}} sprites',
  'GameOptions.assets-missing': 'Not imported',
  'GameOptions.import-assets': '$t(ImportAssetsWindow.title)',
  'GameOptions.autosave': 'Autosave',
  'GameOptions.autosave-choice.10': 'Game start, then every 10 turns',
  'GameOptions.autosave-choice.20': 'Game start, then every 20 turns',
  'GameOptions.autosave-choice.5': 'Game start, then every 5 turns',
  'GameOptions.autosave-choice.off': 'Off',
  'GameOptions.autosave-choice.start': 'Game start',
  'GameOptions.colour-scheme': 'Colors',
  'GameOptions.colour-scheme-choice.dark': 'Dark',
  'GameOptions.colour-scheme-choice.light': 'Light',
  'GameOptions.colour-scheme-choice.system': 'System default',
  'GameOptions.interface': 'Interface',
  'GameOptions.interface-choice.classic': 'Classic',
  'GameOptions.interface-choice.modern': 'Modern',
  'GameOptions.interface-next-load':
    'The interface changes the next time the page loads.',
  'GameOptions.keep-building-military-units': 'Keep building military units',
  'GameOptions.lock-vertical-edges': 'Stop the map at the poles',
  'GameOptions.map-scale': 'Map scale',
  'GameOptions.new-cities-build-defender': 'New cities build a defender',
  // Civilization's music from the player's ASOUND.CVL (#126).
  'GameOptions.sound': 'Sound',
  'GameOptions.sound-unavailable':
    'Import {{file}} from the original Civilization files to hear its music.',
  'GameOptions.sound-volume': 'Sound volume',
  'GameOptions.square-tooltips': 'Describe the map square under the mouse',
  'GameOptions.theme': 'Theme',
  'GameOptions.unit-edge-margin':
    'Keep the active unit this many tiles from the edge',
  'GameOptions.unit-marker': 'Unit awaiting orders',
  'GameOptions.unit-marker-choice.blink': 'Blink',
  'GameOptions.unit-marker-choice.both': 'Ring and blink',
  'GameOptions.unit-marker-choice.ring': 'Ring',
  'GameOptions.unit-marker-choice.theme': "The theme's way",
  'GameSetup.add-seat': 'Add a seat',
  'GameSetup.advanced': 'Advanced',
  'GameSetup.ai': 'AI',
  'GameSetup.civilization': 'Civilization',
  'GameSetup.computer': 'Computer',
  'GameSetup.difficulty': '$t(DifficultyWindow.title)',
  'GameSetup.grid': 'Map grid',
  'GameSetup.human': 'Human',
  'GameSetup.kind': 'Played by',
  'GameSetup.leader': 'Leader',
  'GameSetup.map': 'Map',
  'GameSetup.name': 'Name',
  'GameSetup.random': 'Random',
  'GameSetup.remove-seat': 'Remove this seat',
  'GameSetup.rules': 'Rules',
  'GameSetup.seat': '#',
  'GameSetup.seats': 'Seats',
  'GameSetup.start': 'Start',
  'GameSetup.title': 'Game setup',
  'ResumeGame.intro':
    'Who plays each civilization? Take over a computer seat, or hand yours to the computer, before the game goes on.',
  'ResumeGame.resume': 'Resume',
  'ResumeGame.title': 'Resume game',
  'Grid.hex-odd-r': 'Hex',
  'Grid.square': 'Square',
  'Grid.staggered-iso': 'Isometric',
  'ImportAssetsWindow.brave':
    '<p>It looks like you\'re using Brave and due to the use of <code>HTMLCanvasElement</code>\'s <code>getImageData</code> and <code>toDataURL</code> functions, please put Shields down while importing, and playing, otherwise any color-replaced icons won\'t look correct. <strong>Remember to put them back up after!</strong></p><p><a href="https://brave.com/privacy-updates/4-fingerprinting-defenses-2.0/#2-fingerprinting-protections-20-farbling-for-great-good" target="_blank">Read more about "farbling".</a></p>',
  'ImportAssetsWindow.choose': 'Choose files',
  'ImportAssetsWindow.chosen': '{{files, list}}',
  'ImportAssetsWindow.done':
    'Done! Please reload the page to utilize the fresh assets.',
  'ImportAssetsWindow.failed':
    'Importing the assets failed ({{error}}). Try again, and check that the browser lets this site store data.',
  'ImportAssetsWindow.missing-files': `Please provide all files to generate assets: {{files, list}}.`,
  'ImportAssetsWindow.none-chosen': 'No files chosen',
  'ImportAssetsWindow.optional-sound': 'Add {{file}} for the music.',
  'ImportAssetsWindow.missing-data':
    'Not all expected data was written. Might need to try again... Missing: {{files, list}}.',
  'ImportAssetsWindow.progress-building': 'Building image assets...',
  'ImportAssetsWindow.progress-writing': 'Writing to database...',
  'ImportAssetsWindow.replace-existing': 'Replace existing assets?',
  'ImportAssetsWindow.storage-blocked':
    "Your browser is blocking this site from storing data, so imported assets can't be kept. Allow site data (cookies and storage) for this site, then reload the page.",
  'ImportAssetsWindow.title': 'Import assets',
  'ImportAssetsWindow.unsupported-file':
    "{{file}} doesn't look like a supported Civilization file, so no assets were extracted. Check it is the original file from Civilization for DOS and try again.",
  'LoadGame.could-not-delete': 'That save could not be deleted: {{- error}}',
  'LoadGame.delete': 'Delete',
  'LoadGame.delete-confirm': 'Delete “{{name}}”? This cannot be undone.',
  'LoadGame.delete-save': 'Delete {{- name}}',
  'LoadGame.download': 'Download',
  'LoadGame.download-save': 'Download {{- name}}',
  'LoadGame.empty': 'There are no saved games left in this browser.',
  'LoadGame.from-file': 'Load from a file…',
  'LoadGame.kind.autosave': 'Autosave',
  'LoadGame.kind.player': 'Your save',
  'LoadGame.kind.start': 'Game start',
  'LoadGame.load': 'Load',
  'LoadGame.load-save': 'Load {{- name}}',
  'LoadGame.title': '$t(GameMenu.load-game)',
  'MandatorySelection.default-body': '$t(SelectionWindow.default-body)',
  'NewGameWindow.number-of-players': 'How many players?',
  'NewGameWindow.map-grid': 'Which map grid?',
  'NewGameWindow.world-size': 'How big a world?',
  // New Game's first row under the new interface (#749): the game setup, for everything the questions don't ask.
  'NewGameWindow.customize': 'Customize…',
  'NewGameWindow.customize-meta':
    'Choose the civilizations, seats, rules and the exact world',
  'ReleaseWindow.behind-the-scenes': 'Behind the scenes',
  'ReleaseWindow.external-changes': 'External changes',
  'ReleaseWindow.failed': 'The release notes could not be loaded.',
  'ReleaseWindow.loading': 'Loading the release notes…',
  'ReleaseWindow.title': 'Releases',
  'SavedGame.could-not-hand-over':
    'That save could not be handed to the reloading page, so the game has not been loaded: {{- error}}',
  'SavedGame.could-not-read': 'That save could not be read: {{- error}}',
  'SavedGame.could-not-write': 'That save could not be written: {{- error}}',
  'SavedGame.needs-grid':
    'That save is on a {{- grid}} map, which can’t be drawn here, so it has not been loaded.',
  // A save on a grid whose pack's art hasn't been imported (#97), named by its tileset.
  'SavedGame.needs-import':
    'That save’s map is {{- grid}}, drawn with art from {{- tileset}}, which hasn’t been imported, so it has not been loaded. Import it in Import assets, then load the save again.',
  'SavedGame.no-decompression':
    'this browser cannot read compressed saves — it has no `DecompressionStream`',
  'SavedGame.not-a-save': 'the file is not a civ-clone save',
});

// What the setup says about the rule sets themselves (#954), beside the sets' own names, which are their packages'.
//  Under `RuleSets.`, which no package's id can be.
i18next.addResources('en', 'ruleset', {
  'RuleSets.conflict':
    '{{- first}} and {{- second}} can’t both be on. Switch one of them off.',
  'RuleSets.not-loaded':
    '{{- name}} refers to a rule or rule set that isn’t loaded.',
  'RuleSets.replaced-by': 'replaced by {{names, list}}',
  'RuleSets.unusable':
    'The rule sets can’t be used as they are: a package that provides them needs fixing.',
});
