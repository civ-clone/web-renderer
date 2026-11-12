import civ2Import, { civ2Pack } from './lib/civ2Import';
import civ2 from './civ2.json';
import { registerPackImport } from '@civ-clone/ui-assets/lib/packImports';
import { registerTileset } from '@civ-clone/ui-assets/lib/tilesets';
import validateDescriptor from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';

// Civilization II's art pack (#97): the tileset the staggered isometric map is drawn with (#152), once the player has
//  imported its sprites from their own copy, and that import, which keeps a record of the sprites' anchors and the
//  flags' colours beside them. The page loads this after Civ1's, the interface's pack.

/** Civ2's tileset: the staggered isometric map's. */
export const civ2Tileset = registerTileset(validateDescriptor(civ2), {
  metadata: civ2Pack.metadata,
});

registerPackImport(civ2Import);

export default civ2Tileset;
