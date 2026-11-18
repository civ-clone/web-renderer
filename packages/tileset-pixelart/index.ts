import { TilesetDescriptor } from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';
import descriptor from '@civ-clone/civ1-tileset-pixelart/pack/tileset.json';
import hexDescriptor from '@civ-clone/civ1-tileset-pixelart/pack-hex/tileset.json';
import isoDescriptor from '@civ-clone/civ1-tileset-pixelart/pack-iso/tileset.json';
import { registerTileset } from '@civ-clone/ui-assets/lib/tilesets';
import sheets from './sheets';
import validateDescriptor from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';

// civ.one's own pixel art (#1063), drawn for it and MIT licensed (civ-clone/civ1-tileset-pixelart): the square map's art
//  where the player hasn't imported Civilization's, and the interface's, which each theme lists after Civ1's; the
//  hexagonal map's (slice 4 of docs/asset-library.md), the only art there is for that grid; and the isometric map's,
//  where the player hasn't imported Civilization II's. All three ship with civ.one, each as one sheet beside the game
//  that the asset store fetches, so they need nothing imported or stored.

/** `pack`, registered as a hosted set under the pixel art's licence, with the sheet the build packed it into. */
const registerHosted = (pack: unknown): TilesetDescriptor => {
  const tileset = validateDescriptor({
    ...(pack as object),
    source: 'hosted',
    licence: {
      name: 'MIT',
      url: 'https://github.com/civ-clone/civ1-tileset-pixelart/blob/main/LICENSE',
    },
  });

  return registerTileset(tileset, { hosted: sheets[tileset.id] });
};

/** The pixel art's square tileset. */
export const pixelArtTileset = registerHosted(descriptor);

/**
 * The pixel art's hexagonal tileset (`hex-pixelart`), the hex map's. Its cities' rims are an overlay in its own key
 *  colours, which it keeps: a hosted set has no import to have recorded others (`installTilesets`).
 */
export const hexPixelArtTileset = registerHosted(hexDescriptor);

/**
 * The pixel art's isometric tileset (`iso-pixelart`), the staggered isometric map's until Civilization II's art is
 *  imported, so every player can play on that grid. Like the hexagonal set, it keeps its own key colours for the cities'
 *  rims.
 */
export const isoPixelArtTileset = registerHosted(isoDescriptor);

export default pixelArtTileset;
