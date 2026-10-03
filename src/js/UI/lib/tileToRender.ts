import { ObjectStore, PlainObject } from './reconstituteData';

/**
 * The tile a patched object asks the map to redraw, if any. A tile redraws
 * itself, and so does a city's: what the map shows for a city (its size, or an
 * unhappy citizen in civil disorder) can change with nothing on its tile being
 * sent, as when a specialist is changed on the city screen. A city's tile
 * normally arrives as a ref, so it is looked up in `objects`.
 */
export const tileToRender = (
  object: PlainObject,
  objects: ObjectStore
): { x: number; y: number } | null => {
  if (object._ === 'PlayerTile') {
    return object as { x: number; y: number };
  }

  if (object._ !== 'City' || !object.tile) {
    return null;
  }

  const tile = object.tile['#ref'] ? objects[object.tile['#ref']] : object.tile;

  return tile && tile._ === 'PlayerTile' ? tile : null;
};

export default tileToRender;
