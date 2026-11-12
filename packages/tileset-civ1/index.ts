import validateDescriptor from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';
import civ1 from './civ1.json';
import civ1Import from './lib/civ1Import';
import { registerPackImport } from '@civ-clone/ui-assets/lib/packImports';
import { registerTileset } from '@civ-clone/ui-assets/lib/tilesets';

// Civilization I's art pack (#97): the tileset the square map is drawn with and the interface's art comes from, and the
//  import that cuts its sprites from the player's own copy. The page loads this before anything is drawn.

/** Civ1's tileset: the square map's, and the interface's (`interfaceTileset`). */
export const civ1Tileset = registerTileset(validateDescriptor(civ1), {
  interface: true,
});

registerPackImport(civ1Import);

export default civ1Tileset;
