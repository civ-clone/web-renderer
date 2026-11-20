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
  'GameMenu.library': '$t(LibraryWindow.title)',
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
  'GameMenu.spaceship': 'Spaceship',
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
  'GameOptions.assets-missing': '{{tileset}} assets not imported',
  'GameOptions.library': '$t(LibraryWindow.title)',
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
  'GameOptions.new-cities-build-defender': 'New cities build a defender',
  // Civilization's music from the player's ASOUND.CVL (#126).
  'GameOptions.sound': 'Sound',
  'GameOptions.sound-unavailable':
    'Import {{file}} from the original Civilization files to hear its music.',
  'GameOptions.sound-volume': 'Sound volume',
  'GameOptions.square-tooltips': 'Describe the map square under the mouse',
  'GameOptions.theme': 'Theme',
  'GameOptions.theme-art-next-load':
    "The theme's icons change the next time the page loads.",
  'GameOptions.unit-edge-margin':
    'Keep the active unit this many tiles from the edge',
  'GameOptions.unit-marker': 'Unit awaiting orders',
  'GameOptions.unit-marker-choice.blink': 'Blink',
  'GameOptions.unit-marker-choice.both': 'Ring and blink',
  'GameOptions.unit-marker-choice.ring': 'Ring',
  'GameOptions.unit-marker-choice.theme': "The theme's way",
  // How the 3D map's units move from square to square (`?3d=1`), and whether other players' are shown moving.
  'GameOptions.walks': 'Units moving on the 3D map',
  'GameOptions.walks-choice.fast': 'Walk quickly',
  'GameOptions.walks-choice.normal': 'Walk',
  'GameOptions.walks-choice.off': 'Move at once',
  'GameOptions.rivals-walk': "Show other players' units moving on the 3D map",
  // How big the 3D map draws its units (`?3d=1`), and the size they're at: 1.25×.
  'GameOptions.unit-size': 'Size of units on the 3D map',
  'GameOptions.unit-size-value': '{{size}}×',
  // The map's zoom (#1063), and what it's at: 1.4×.
  'GameOptions.zoom': 'Zoom',
  'GameOptions.zoom-value': '{{zoom}}×',
  'GameSetup.add-seat': 'Add a seat',
  'GameSetup.advanced': 'Advanced',
  'GameSetup.ai': 'AI',
  'GameSetup.civilization': 'Civilization',
  'GameSetup.computer': 'Computer',
  // Which game the setup is for (#668), shown once there is more than one.
  'GameSetup.game': 'Game',
  'GameSetup.game-failed': 'That game couldn’t be set up: {{- error}}',
  'GameSetup.game-failed-title': 'Couldn’t set up the game',
  // The legend of a game's Original and Enhanced rules (#1248), read out by a screen reader.
  'GameSetup.game-rules': '{{game}} rules',
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
  // A game's two sets of rules (#1248): the original game's own, or with civ.one's fixes and additions, each of which
  //  is listed beneath it and can be switched off.
  // How many of the enhanced rules' changes are on, folded beneath Enhanced rules.
  'GameSetup.rules-changes':
    'Changes from the original: {{on}} of {{count}} on',
  'GameSetup.rules-enhanced': 'Enhanced rules',
  'GameSetup.rules-enhanced-description':
    'civ.one’s fixes and additions to the original, each of which can be switched off.',
  'GameSetup.rules-original': 'Original rules',
  'GameSetup.rules-original-description':
    'The rules and civilizations as the original game has them.',
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
  // None of the files chosen is one the set reads (#1063).
  'ImportAssetsWindow.none-of-its-files':
    'None of those files is for {{name}}: choose {{files, list(type: disjunction)}}.',
  'ImportAssetsWindow.none-chosen': 'No files chosen',
  'ImportAssetsWindow.missing-data':
    'Not all expected data was written. Might need to try again... Missing: {{files, list}}.',
  'ImportAssetsWindow.progress-building': 'Building image assets...',
  'ImportAssetsWindow.progress-writing': 'Writing to database...',
  'ImportAssetsWindow.replace-existing': 'Replace existing assets?',
  'ImportAssetsWindow.storage-blocked':
    "Your browser is blocking this site from storing data, so imported assets can't be kept. Allow site data (cookies and storage) for this site, then reload the page.",
  // One set's import (#1063), by the set's name.
  'ImportAssetsWindow.title': 'Import {{name}}',
  'ImportAssetsWindow.unsupported-file':
    "{{file}} doesn't look like a supported Civilization file, so no assets were extracted. Check it is the original file from Civilization for DOS and try again.",
  // Civilization's music as a set of its own (#126, #1063): what its import window says of ASOUND.CVL.
  // The game its file comes from, as the library says the set comes from the player's copy of it.
  'Civ1Sound.game': 'Civilization',
  'Civ1Sound.import':
    'Upload {{file}} from the original Civilization files for the music (it will be stored locally).',
  // The library of art and sound (#1063), which replaced Import assets.
  'LibraryWindow.title': 'Art and sound',
  'LibraryWindow.map': 'Map art',
  'LibraryWindow.themes': 'Themes',
  'LibraryWindow.sound': 'Sound',
  // What a set gives the game.
  'LibraryWindow.provides.map': '{{grid}} map art',
  'LibraryWindow.provides.interface': 'Interface art',
  'LibraryWindow.provides.music': 'Music',
  // Where a set comes from.
  'LibraryWindow.imported': 'From your copy of {{game}}',
  'LibraryWindow.hosted': 'Comes with civ.one',
  'LibraryWindow.licence': 'License:',
  // A set's status: ready, the files it still needs (and the optional ones it can add), or nothing of it imported.
  'LibraryWindow.status.ready': 'Ready',
  'LibraryWindow.status.needs': 'Needs {{files, list}}',
  'LibraryWindow.status.optional': 'Optional: {{files, list}}',
  'LibraryWindow.status.none': 'Not imported',
  'LibraryWindow.status.unloaded': 'Couldn’t be loaded',
  'LibraryWindow.import': 'Import…',
  // During a game (#1118), when nothing can be imported.
  'LibraryWindow.import-in-game':
    'Art and sound are imported from the main menu, as importing loads the page again, which would end this game.',
  'LibraryWindow.import-again': 'Import again',
  // The buttons' names for assistive technology, which say whose they are.
  'LibraryWindow.import-set': 'Import {{name}}',
  'LibraryWindow.import-set-again': 'Import {{name}} again',
  'LibraryWindow.use-theme': 'Use {{name}}',
  'LibraryWindow.in-use': 'In use',
  'LibraryWindow.use': 'Use',
  // A map set's choice for its grid (#1063), and its name for assistive technology, which says whose it is.
  'LibraryWindow.use-for-grid': 'Use for {{grid}} maps',
  'LibraryWindow.use-set-for-grid': 'Use {{name}} for {{grid}} maps',
  'LibraryWindow.in-use-for-grid': 'In use for {{grid}} maps',
  // During a game whose rules name their own art for the grid (Civ2's), which outranks the player's choice (#1144).
  'LibraryWindow.rule-set-art':
    'This game’s rules draw {{grid}} maps with {{name}}, so other art for them can be chosen only outside this game.',
  // Whose interface art a theme draws with now (#1063): an imported set's by its game, one that ships with civ.one by
  //  its name, unless it has words of its own here.
  'LibraryWindow.theme-art.imported': 'Uses {{game}}’s art',
  'LibraryWindow.theme-art.set': 'Uses {{name}}',
  'LibraryWindow.theme-art.civ1-pixelart': 'Uses civ.one’s pixel art',
  'LibraryWindow.theme-art.none':
    'Has no art to draw with: civ.one’s own couldn’t be loaded',
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
  'MapArt.fell-back':
    '{{failed, list}} couldn’t be loaded ({{- reason}}), so the map is drawn with {{used}} instead.',
  'MapArt.fell-back-title': 'Drawing with other art',
  'MandatorySelection.default-body': '$t(SelectionWindow.default-body)',
  'NewGameWindow.number-of-players': 'How many players?',
  'NewGameWindow.map-grid': 'Which map grid?',
  // New Game's first question once there is more than one game to play (#668).
  'NewGameWindow.game': 'Which game?',
  // New Game's game when there's only the one (#1247), before the worker has been asked which it is.
  'NewGameWindow.default-game': 'Civilization',
  // Under each game in New Game (#1247): what it will start with, as last time or the defaults.
  'NewGameWindow.game-meta':
    'A {{- size}} world on the {{- grid}} grid, {{- civilizations}}',
  // A game and what it starts with, on one line, in a list with no room for more.
  'NewGameWindow.game-line': '{{- game}}: {{- summary}}',
  'NewGameWindow.grid-name.hex-odd-r': 'hex',
  'NewGameWindow.grid-name.square': 'square',
  'NewGameWindow.grid-name.staggered-iso': 'isometric',
  'NewGameWindow.play': 'Play {{- game}}',
  'NewGameWindow.size-name.huge': 'huge',
  'NewGameWindow.size-name.large': 'large',
  'NewGameWindow.size-name.normal': 'normal',
  'NewGameWindow.size-name.small': 'small',
  'NewGameWindow.size-name.tiny': 'tiny',
  'NewGameWindow.no-earth': 'it has no Earth map.',
  'NewGameWindow.world-size': 'How big a world?',
  // New Game's last row (#749, #1247): the game setup, for everything else.
  'NewGameWindow.customize': 'Customize…',
  'NewGameWindow.customize-meta':
    'Choose the civilizations, seats, rules and the exact world',
  // The games a new game can be (#668), by plugin set: titles, spelled as the games are in every English. Civ2's rules
  //  are a preview, and its saves may not load once more of them is in.
  'PluginSet.civ1': 'Civilization, original rules',
  'PluginSet.civ1-enhanced': 'Civilization',
  'PluginSet.civ2': 'Civilization II (preview)',
  // Civ2's rules with the fixes of the original's slips, which a game can turn off one by one (M2d).
  'PluginSet.civ2-enhanced': 'Civilization II, enhanced (preview)',
  // A game as the setup's cards name it (#1248), where its set's name says more than which game it is: its original
  //  rules are chosen beneath it.
  'PluginSetGame.civ2-enhanced': 'Civilization II (preview)',
  'ReleaseWindow.behind-the-scenes': 'Behind the scenes',
  'ReleaseWindow.external-changes': 'External changes',
  'ReleaseWindow.failed': 'The release notes could not be loaded.',
  'ReleaseWindow.loading': 'Loading the release notes…',
  // Why the menus offer no game (#1063): there's no art to draw one with, on a first visit offline with nothing imported.
  'Menus.no-art.interface':
    'There’s no art to draw the game with: civ.one’s own couldn’t be loaded. Check your connection and reload the page, or import Civilization’s art in Art and sound.',
  'Menus.no-art.map':
    'There’s no art to draw a map with: civ.one’s own couldn’t be loaded. Check your connection and reload the page, or import Civilization’s art in Art and sound.',
  'ReleaseWindow.title': 'Releases',
  // A game carried over to a new page for new art (#1118) that couldn't be: it goes on as it was.
  'SavedGame.could-not-carry-over':
    'The game could not be carried over to a new page, so it goes on as it was, and the new art is drawn from the next time the page loads: {{- error}}',
  'SavedGame.could-not-hand-over':
    'That save could not be handed to the reloading page, so the game has not been loaded: {{- error}}',
  'SavedGame.could-not-read': 'That save could not be read: {{- error}}',
  'SavedGame.could-not-write': 'That save could not be written: {{- error}}',
  'SavedGame.needs-grid':
    'That save is on a {{- grid}} map, which can’t be drawn here, so it has not been loaded.',
  // A save on a grid whose pack's art hasn't been imported (#97), named by its tileset.
  'SavedGame.needs-import':
    'That save’s map is {{- grid}}, drawn with art from {{- tileset}}, which hasn’t been imported, so it has not been loaded. Import it in Art and sound, then load the save again.',
  // A save whose rule set needs art of its own that hasn't been imported (#97): a Civ2 game without Civ2's art.
  'SavedGame.needs-rules-art':
    'That save is a {{- game}} game, drawn with art from {{- tileset}}, which hasn’t been imported, so it has not been loaded. Import it in Art and sound, then load the save again.',
  'SavedGame.no-decompression':
    'this browser cannot read compressed saves — it has no `DecompressionStream`',
  'SavedGame.not-a-save': 'the file is not a civ-clone save',
  // How to play (#1270): the first turns and the controls, by device. Keys are shown from what the game binds.
  'HowToPlay.title': 'How to play',
  'HowToPlay.or': ' or ',
  'HowToPlay.device.label': 'Describe the controls for',
  'HowToPlay.device.touch': 'Touch screen',
  'HowToPlay.device.desktop': 'Mouse and keyboard',
  'HowToPlay.heading.first-turns': 'Your first turns',
  'HowToPlay.heading.controls': 'Controls',
  'HowToPlay.heading.more': 'Finding out more',
  'HowToPlay.first.turns':
    'Each turn, you give your units their orders and choose what your cities build. The unit waiting for its orders is shown in the Active Unit panel. Once every unit has had its orders, the turn ends by itself, unless you turn that off in Options.',
  'HowToPlay.first.move_desktop':
    'Move the active unit with the arrow keys or the numeric keypad. To send it further, press and hold on the square it should go to, and choose Go to.',
  'HowToPlay.first.move_touch':
    'Move the active unit by pressing and holding a square next to it, and choosing what to do there. Press and hold a square further away, and choose Go to, to send it there.',
  'HowToPlay.first.city':
    'Settlers build cities: with your Settlers active, choose “$t(unit:Action.FoundCity.name)”, from the unit’s buttons or its menu, and a city is built where they stand.',
  'HowToPlay.first.production':
    'Each city builds one thing at a time. Open a city, on the map or from the Cities list, to choose what it builds and which squares its people work.',
  'HowToPlay.first.end-turn':
    'To end the turn yourself, use the end-of-turn button.',
  'HowToPlay.first.screen':
    'The top bar shows your treasury, your research and your government. The sidebar has the map of the world, the active unit, your cities and how you compare with the other civilizations.',
  'HowToPlay.touch.tap-city': 'Tap one of your cities to open it.',
  'HowToPlay.touch.tap-units':
    'Tap a square with your units on it to choose which of them to give orders.',
  'HowToPlay.touch.tap-elsewhere': 'Tap anywhere else to center the map there.',
  'HowToPlay.touch.hold':
    'Press and hold a square to see what the active unit can do there: move, attack, or go further.',
  'HowToPlay.touch.drag': 'Drag the map to move it.',
  'HowToPlay.touch.buttons':
    'The active unit’s order buttons give it its orders.',
  'HowToPlay.touch.show-keys': 'Keyboard shortcuts',
  'HowToPlay.desktop.click-city': 'Click one of your cities to open it.',
  'HowToPlay.desktop.click-units':
    'Click a square with your units on it to choose which of them to give orders.',
  'HowToPlay.desktop.click-elsewhere':
    'Click anywhere else to center the map there.',
  'HowToPlay.desktop.hold':
    'Press and hold on a square to see what the active unit can do there: move, attack, or go further.',
  'HowToPlay.desktop.hold_right':
    'Right-click a square, or press and hold on it, to see what the active unit can do there: move, attack, or go further.',
  'HowToPlay.desktop.drag': 'Drag the map to move it.',
  'HowToPlay.desktop.wheel':
    'Scroll the mouse wheel, or pinch the trackpad, to zoom in and out.',
  'HowToPlay.desktop.hover':
    'Rest the pointer on one of your cities to see what it’s building.',
  'HowToPlay.desktop.hover_squares':
    'Rest the pointer on one of your cities to see what it’s building, or on a square to see what’s there.',
  'HowToPlay.keys.intro':
    'The arrow keys, and the numeric keypad, move the active unit.',
  'HowToPlay.keys.move.straight':
    'Move up, down, left or right (on a hex map, up and down don’t move)',
  'HowToPlay.keys.move.diagonal': 'Move diagonally',
  'HowToPlay.keys.game': 'On the map:',
  'HowToPlay.keys.unit':
    'The active unit’s orders, which its buttons show too (some are Civilization II’s alone):',
  'HowToPlay.keys.windows':
    'A city and the lists have keys of their own, shown on their buttons, and Escape closes a window.',
  'HowToPlay.key.endTurn': 'End the turn, or go on to what’s waiting',
  'HowToPlay.key.wait': 'Wait, and give the next unit its orders',
  'HowToPlay.key.centre': 'Center the map on the active unit',
  'HowToPlay.key.findCity': 'Find a city',
  'HowToPlay.key.zoomIn': 'Zoom in and out',
  'HowToPlay.key.toggleUnits': 'Show or hide the units',
  'HowToPlay.key.toggleYields': 'Show or hide what each square yields',
  'HowToPlay.key.firstAction': 'Go to the turn’s buttons',
  'HowToPlay.key.tradeRates': 'Change your tax, luxuries and science rates',
  'HowToPlay.key.civilopedia': 'The Civilopedia',
  'HowToPlay.key.cityStatus': '$t(GameMenu.city-status)',
  'HowToPlay.key.militaryReport': '$t(GameMenu.military-report)',
  'HowToPlay.key.intelligenceReport': '$t(GameMenu.intelligence-report)',
  'HowToPlay.key.happinessReport': '$t(GameMenu.happiness-report)',
  'HowToPlay.key.tradeReport': '$t(GameMenu.trade-report)',
  'HowToPlay.key.scienceReport': '$t(GameMenu.science-report)',
  'HowToPlay.key.wondersReport': '$t(GameMenu.wonders-report)',
  'HowToPlay.key.topCities': '$t(GameMenu.top-cities)',
  'HowToPlay.key.civilizationScore': '$t(GameMenu.civilization-score)',
  'HowToPlay.key.saveGame': 'Save the game',
  'HowToPlay.more.civilopedia':
    'The Civilopedia, in the Game menu, says what every advance, unit, building and Wonder does, and what each needs.',
  'HowToPlay.more.reports':
    'The reports, in the Game menu, show your cities, your armies, your trade, your research and how you stand.',
  'HowToPlay.more.saves':
    'The game is saved as you play, and the title screen picks it up where you left off. Save Game, in the Game menu, keeps a copy as a file.',
  'HowToPlay.more.new-game':
    'A new game asks for a level of difficulty, from the easiest to the toughest. $t(NewGameWindow.customize) chooses your civilization, the world and the rules too.',
  'HowToPlay.more.options':
    'Options changes how the game looks, sounds and plays.',
  'HowToPlay.prompt.question': 'New to the game?',
  'HowToPlay.prompt.open': 'How to play',
  'HowToPlay.prompt.dismiss': 'Dismiss',
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
