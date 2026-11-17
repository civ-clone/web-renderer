// The Civ1 tileset package's own text (#97): what its import window says of Civilization's files.
import i18next from 'i18next';

i18next.addResources('en', 'default', {
  // The game its files come from, as the library says the set comes from the player's copy of it (#1063).
  'TilesetCiv1.game': 'Civilization',
  'TilesetCiv1.import':
    'Upload {{files, list}} from the original Civilization files to extract assets (these will be stored locally). This only takes a moment.',
  // After the instructions, the files an import takes when they're chosen (#64).
  'TilesetCiv1.import-optional':
    'Add {{files, list}} as well for the improvement and Wonder icons.',
});
