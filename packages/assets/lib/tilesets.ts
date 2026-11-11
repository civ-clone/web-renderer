import validateDescriptor, {
  Size,
  TilesetDescriptor,
} from '../tilesets/TilesetDescriptor';
import civ1 from '../tilesets/civ1.json';

// The tilesets the map can be drawn with (#56). Only Civ1's for now: a second pack, and the choice between them, come
//  with #152.
const civ1Tileset = validateDescriptor(civ1);

/** The tilesets there are to draw the map with: the grids a game can be on are theirs (`supportedTopologies`). */
export const installedTilesets = (): TilesetDescriptor[] => [civ1Tileset];

/** The tileset the map is drawn with. */
export const currentTileset = (): TilesetDescriptor => civ1Tileset;

/**
 * `tileset`'s native tile size in px, across and down, as the map takes it: the map scales both by its scale. A grid
 * draws only the sizes its projection can lay out, and refuses the rest when it is asked for one (`projectionFor`).
 */
export const nativeTileSize = ({
  tile: { width, height },
}: TilesetDescriptor): Size => ({ width, height });

export default currentTileset;
