import descriptor from '@civ-clone/civ1-tileset-pixelart/pack/tileset.json';
import { registerTileset } from '@civ-clone/ui-assets/lib/tilesets';
import sheets from './sheets';
import validateDescriptor from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';

// civ.one's own pixel art (#1063), drawn for it and MIT licensed (civ-clone/civ1-tileset-pixelart): the square map's art
//  where the player hasn't imported Civilization's, and the interface's, which each theme lists after Civ1's. It ships
//  with civ.one, as one sheet beside the game that the asset store fetches, so it needs nothing imported or stored.
//  Its hexagonal art comes later (slice 4 of docs/asset-library.md).

/** The pixel art's square tileset. */
export const pixelArtTileset = registerTileset(
  validateDescriptor({
    ...descriptor,
    source: 'hosted',
    licence: {
      name: 'MIT',
      url: 'https://github.com/civ-clone/civ1-tileset-pixelart/blob/main/LICENSE',
    },
  }),
  { hosted: sheets[descriptor.id] }
);

export default pixelArtTileset;
