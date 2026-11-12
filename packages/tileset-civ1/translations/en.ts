// The Civ1 tileset package's own text (#97): what the Import Assets window says of Civilization's files.
import i18next from 'i18next';

i18next.addResources('en', 'default', {
  'TilesetCiv1.import':
    'Upload {{files, list}} from the original Civilization files to extract assets (these will be stored locally). This only takes a moment.',
  // After the instructions, the files an import takes when they're chosen (#64).
  'TilesetCiv1.import-optional':
    'Add {{files, list}} as well for the improvement and Wonder icons.',
});
