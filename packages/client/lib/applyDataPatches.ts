import { DataPatch, PlainObject } from '../types';
import { ObjectMap } from './reconstituteData';

// Applies `gameDataPatch` batches to the object map the page holds, in place. Shared by `GameState` and the tests that
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

export type DataPatchCallbacks = {
  /** Each id an entry adds or updates, and each id in its side-table, in the order applied. */
  changed(id: string): void;
  /** Each `PlayerTile` in a side-table, once it is in the map and `changed`. */
  tile?(tile: PlainObject): void;
  /** Each whole object an add or update puts in the map, its own or in its side-table, with the one it replaced. */
  set?(id: string, value: PlainObject, previous: PlainObject | undefined): void;
};

/**
 * Applies `patches` to `objectMap` in order. An add or update sets the whole id, or with `index` the path inside it,
 * then copies its side-table of objects in. One without a `hierarchy` is skipped whole, side-table included. The
 * worker never removes an id: objects nothing reaches any more are pruned (`pruneObjectMap`).
 */
export const applyDataPatches = (
  objectMap: ObjectMap,
  patches: DataPatch[],
  { changed, tile, set }: DataPatchCallbacks
): void =>
  patches.forEach((patch) =>
    Object.entries(patch).forEach(([key, { index, value }]) => {
      if (!value!.hierarchy) {
        console.error('No hierarchy');
        console.error(value);

        return;
      }

      const patchKey = key,
        original = objectMap.objects[key],
        // The worker sends an object as a ref to itself, with the object in the side-table: `set` hears of it once,
        //  from the side-table, with what the map held before the ref.
        selfRef =
          !index &&
          value!.hierarchy['#ref'] === key &&
          key in (value!.objects as PlainObject);

      if (index) {
        setObjectPath(objectMap.objects[key], index, value!.hierarchy);
      } else {
        objectMap.objects[key] = value!.hierarchy;

        if (!selfRef) {
          set?.(key, value!.hierarchy, original);
        }
      }

      changed(key);

      Object.entries(value!.objects as PlainObject).forEach(([key, value]) => {
        const previous =
          selfRef && key === patchKey ? original : objectMap.objects[key];

        objectMap.objects[key] = value;
        set?.(key, value, previous);
        changed(key);

        if (value._ === 'PlayerTile') {
          tile?.(value);
        }
      });
    })
  );

export default applyDataPatches;
