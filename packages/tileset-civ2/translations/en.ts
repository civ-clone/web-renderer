// The Civ2 tileset package's own text (#97): what the Import Assets window and Options say of Civilization II's files.
import i18next from 'i18next';

i18next.addResources('en', 'default', {
  // Civilization II's sheets, for its isometric map: optional, as Civilization's own files are all a game needs.
  'TilesetCiv2.import-optional':
    'To play on an isometric map, add {{files, list}} from Civilization II as well (optional).',
  // Civilization II's sheets the isometric map can do without (#999): ICONS.GIF, its yield icons.
  'TilesetCiv2.import-icons':
    'Add {{files, list}} too for Civilization II’s own food, shield and trade icons on that map (optional).',
  'TilesetCiv2.complete':
    'Civilization II’s map art is imported: new games can be played on the isometric map.',
  'TilesetCiv2.incomplete':
    'Civilization II’s map art is not complete yet: add {{files, list}} to play on the isometric map.',
  'TilesetCiv2.skipped':
    '{{file}} couldn’t be read as Civilization II’s, so it was skipped.',
});
