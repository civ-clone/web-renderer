import { DataPatch, PlainObject } from '../types';
import { ObjectMap } from './reconstituteData';

// Applies `gameDataPatch` batches to the object map the page holds, in place. Shared by `Renderer` and the tests that
//  check what a patch does to the map, so they exercise the same code.

const pathToParts = (path: string) => path.replace(/]/g, '').split(/[.[]/),
  getPenultimateObject = (
    object: PlainObject,
    path: string
  ): [PlainObject, string | undefined] => {
    const parts = pathToParts(path),
      lastPart = parts.pop();

    const tmpObj = parts.reduce((tmpObj, part) => {
      if (!tmpObj || !(part in tmpObj)) {
        return null;
      }

      return tmpObj[part];
    }, object);

    return [tmpObj, lastPart];
  };

/** Sets `path` (`a.b[2].c`) of `object` to `value`. Warns and does nothing if the path does not lead anywhere. */
export const setObjectPath = (
  object: PlainObject,
  path: string,
  value: any
): void => {
  const [tmpObj, lastPart] = getPenultimateObject(object, path);

  if (!tmpObj || !lastPart) {
    console.warn(`unable to set ${path} of ${object} (${lastPart})`);
    return;
  }

  tmpObj[lastPart] = value;
};

/** Removes `path` of `object`: splices an array index out, deletes anything else. Warns if it leads nowhere. */
export const removeObjectPath = (object: PlainObject, path: string): void => {
  const [tmpObj, lastPart] = getPenultimateObject(object, path);

  if (!tmpObj || !lastPart) {
    console.warn(`unable to set ${path} of ${object} (${lastPart})`);
    return;
  }

  if (Array.isArray(tmpObj) && /^\d+$/.test(lastPart)) {
    tmpObj.splice(parseInt(lastPart, 10), 1);

    return;
  }

  delete tmpObj[lastPart];
};

export type DataPatchCallbacks = {
  /** Each id an entry adds, updates or removes, and each id in an add or update's side-table, in the order applied. */
  changed(id: string): void;
  /** Each `PlayerTile` in a side-table, once it is in the map and `changed`. */
  tile?(tile: PlainObject): void;
  /** Each whole object an add or update puts in the map, its own or in its side-table, with the one it replaced. */
  set?(id: string, value: PlainObject, previous: PlainObject | undefined): void;
  /** Each id a remove takes out of the map, if the map held it. A remove with an `index` takes out a path, not an id. */
  removed?(id: string): void;
};

/**
 * Applies `patches` to `objectMap` in order. An add or update sets the whole id, or with `index` the path inside it,
 * then copies its side-table of objects in; a remove deletes the id, or the path inside it. An add or update without
 * a `hierarchy` is skipped whole, side-table included.
 */
export const applyDataPatches = (
  objectMap: ObjectMap,
  patches: DataPatch[],
  { changed, tile, set, removed }: DataPatchCallbacks
): void =>
  patches.forEach((patch) =>
    Object.entries(patch).forEach(([key, { type, index, value }]) => {
      if (type === 'add' || type === 'update') {
        if (!value!.hierarchy) {
          console.error('No hierarchy');
          console.error(value);

          return;
        }

        if (index) {
          setObjectPath(objectMap.objects[key], index, value!.hierarchy);
        } else {
          const previous = objectMap.objects[key];

          objectMap.objects[key] = value!.hierarchy;
          set?.(key, value!.hierarchy, previous);
        }

        changed(key);

        Object.entries(value!.objects as PlainObject).forEach(
          ([key, value]) => {
            const previous = objectMap.objects[key];

            objectMap.objects[key] = value;
            set?.(key, value, previous);
            changed(key);

            if (value._ === 'PlayerTile') {
              tile?.(value);
            }
          }
        );
      }

      if (type === 'remove') {
        changed(key);

        if (index) {
          removeObjectPath(objectMap.objects[key], index);

          return;
        }

        if (key in objectMap.objects) {
          delete objectMap.objects[key];
          removed?.(key);
        }
      }
    })
  );

export default applyDataPatches;
