// The Civ2 tileset package's own text (#97): what its import window and Options say of Civilization II's files.
import i18next from 'i18next';

i18next.addResources('en', 'default', {
  // The game its files come from, as the library says the set comes from the player's copy of it (#1063).
  'TilesetCiv2.game': 'Civilization II',
  // Civilization II's sheets, for its isometric map, in its own import window (#1063).
  'TilesetCiv2.import':
    'Upload {{files, list}} from Civilization II to play on an isometric map (these will be stored locally). You can add them a few at a time.',
  // Civilization II's sheets the isometric map can do without (#999): ICONS.GIF, its yield icons, and PEOPLE.GIF, its
  //  citizens (M2c).
  'TilesetCiv2.import-icons':
    'Add {{files, list}} too for Civilization II’s own food, shield and trade icons on that map, and its citizens in the city screen (optional).',
  'TilesetCiv2.complete':
    'Civilization II’s map art is imported: new games can be played on the isometric map.',
  'TilesetCiv2.incomplete':
    'Civilization II’s map art is not complete yet: add {{files, list}} to play on the isometric map.',
});
