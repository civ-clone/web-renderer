import validateDescriptor, {
  TilesetDescriptor,
} from '../tilesets/TilesetDescriptor';
import civ1 from '../tilesets/civ1.json';

// The tilesets the map can be drawn with (#56). Only Civ1's for now: a second pack, and the choice between them, come
//  with #152.
const civ1Tileset = validateDescriptor(civ1);

/** The tileset the map is drawn with. */
export const currentTileset = (): TilesetDescriptor => civ1Tileset;

/**
 * `tileset`'s native tile size in px, as the map takes it: one number, while every grid the map draws is square. A
 * tileset whose tiles are not square is refused here until the map can draw one (#92).
 */
export const nativeTileSize = ({
  id,
  tile: { width, height },
}: TilesetDescriptor): number => {
  if (width !== height) {
    throw new Error(
      `Tileset "${id}": its ${width} × ${height} tiles are not square, and only square tiles can be drawn yet.`
    );
  }

  return width;
};

export default currentTileset;
