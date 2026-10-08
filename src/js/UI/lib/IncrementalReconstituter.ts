import { ObjectMap, PlainObject } from './reconstituteData';

// The root `hierarchy` is an inline object rather than an id, but it holds refs
//  like any object does, so it takes part in the graph under its own key.
const ROOT = Symbol('root');

type Id = string | typeof ROOT;

// Rebuilds the live game data from its object map, reusing every object a
//  patch did not reach (#322). `reconstituteData` copies everything reachable
//  on every call, which on a late-game save is ~120k objects, when a patch
//  reaches a small part of them. The result must stay deep-equal to
//  `reconstituteData`'s, which remains the oracle for it (and the only rebuild
//  for one-off messages).
export class IncrementalReconstituter {
  // The rebuilt object for every id rebuilt so far, valid until that id or
  //  anything inside it changes.
  #memo: Map<string, any> = new Map();
  // The ids referenced from anywhere in an id's inline subtree, and the
  //  reverse. A change has to rebuild everything that can reach it, because
  //  each of those objects holds the old rebuilt object directly.
  //
  // `parents` is only ever added to between prunes: an entry can outlive the
  //  ref it was recorded for, so it counts only while the parent's `children`
  //  still holds the id. Taking every entry out as its parent was rebuilt, and
  //  putting nearly all of them straight back, cost more than the rebuild.
  #children: Map<Id, Set<string>> = new Map();
  #parents: Map<string, Set<Id>> = new Map();
  #objectMap: ObjectMap | null = null;
  #root: PlainObject | null = null;

  // `changedIds` is every id a patch added, replaced or edited in place since
  //  the last call; `null` when that is not known, which rebuilds everything.
  rebuild(
    objectMap: ObjectMap,
    changedIds: Iterable<string> | null
  ): PlainObject {
    // A different map (a fresh `gameData`) shares nothing with what was built
    //  from the last one, even where the ids match.
    if (changedIds === null || objectMap !== this.#objectMap) {
      this.reset();
      this.#objectMap = objectMap;
    }

    const changed = this.#invalidate(changedIds ?? []);

    if (this.#root !== null && !changed) {
      return this.#root;
    }

    const { objects } = objectMap,
      memo = this.#memo,
      parents = this.#parents,
      children = this.#children;

    const resolve = (id: string): any => {
      // Invalid ids have already left `memo`, and each one rebuilt goes back
      //  in before anything inside it is walked.
      const memoised = memo.get(id);

      if (memoised !== undefined || memo.has(id)) {
        return memoised;
      }

      if (!(id in objects)) {
        console.error(new TypeError(`missing ${id}`));

        return undefined;
      }

      const raw = objects[id],
        refs = new Set<string>();

      children.set(id, refs);

      // An id that is only another ref has no object of its own to memoise
      //  ahead of its contents, so it takes the one it points at.
      if (!(raw instanceof Object) || isRef(raw)) {
        const updated = build(raw, id, refs);

        memo.set(id, updated);

        return updated;
      }

      const updated: any = Array.isArray(raw) ? [] : {};

      // Before descending: the graph has cycles, and a ref back to this id
      //  from inside it has to find this object rather than start another.
      memo.set(id, updated);

      fill(raw, updated, id, refs);

      return updated;
    };

    const link = (owner: Id, refs: Set<string>, id: string): void => {
      refs.add(id);

      const owners = parents.get(id);

      if (owners) {
        owners.add(owner);

        return;
      }

      parents.set(id, new Set([owner]));
    };

    // Plain loops from here on: this is the hot path, run for every value
    //  inside every rebuilt id.
    const fill = (
      raw: any,
      updated: any,
      owner: Id,
      refs: Set<string>
    ): void => {
      if (Array.isArray(raw)) {
        for (let i = 0; i < raw.length; i++) {
          const value: any = raw[i];

          // A ref the frontend no longer holds is left out, as
          //  `reconstituteData` does (#46). The edge is still kept, so the
          //  list is rebuilt when that id arrives.
          if (isRef(value) && !(value['#ref'] in objects)) {
            link(owner, refs, value['#ref']);
            console.error(new TypeError(`missing ${value['#ref']}`));

            continue;
          }

          updated.push(build(value, owner, refs));
        }

        return;
      }

      for (const key in raw) {
        if (Object.prototype.hasOwnProperty.call(raw, key)) {
          updated[key] = build(raw[key], owner, refs);
        }
      }
    };

    const build = (value: any, owner: Id, refs: Set<string>): any => {
      if (isRef(value)) {
        link(owner, refs, value['#ref']);

        return resolve(value['#ref']);
      }

      if (value instanceof Object) {
        const updated: any = Array.isArray(value) ? [] : {};

        fill(value, updated, owner, refs);

        return updated;
      }

      return value;
    };

    const rootRefs = new Set<string>();

    children.set(ROOT, rootRefs);

    const root = build(objectMap.hierarchy, ROOT, rootRefs);

    this.#root = root;

    return root;
  }

  // For ids `pruneObjectMap` removed: nothing reachable referred to them, so
  //  nothing else needs rebuilding, but their entries would otherwise stay.
  //  Prunes are rare enough to also clear every `parents` entry that has
  //  outlived its ref since the last one.
  forget(ids: Iterable<string>): void {
    for (const id of ids) {
      this.#memo.delete(id);
      this.#children.delete(id);
      this.#parents.delete(id);
    }

    this.#parents.forEach((parents, id) => {
      parents.forEach((parent) => {
        if (!this.#children.get(parent)?.has(id)) {
          parents.delete(parent);
        }
      });

      // Refs to ids the map does not hold leave entries nothing else would
      //  clear.
      if (parents.size === 0) {
        this.#parents.delete(id);
      }
    });
  }

  reset(): void {
    this.#memo.clear();
    this.#children.clear();
    this.#parents.clear();
    this.#objectMap = null;
    this.#root = null;
  }

  // Every id the state still holds anything for, for the tests.
  trackedIds(): Set<string> {
    const ids = new Set<string>(this.#memo.keys());

    this.#children.forEach((children, id) => {
      if (id !== ROOT) {
        ids.add(id);
      }

      children.forEach((child) => ids.add(child));
    });

    this.#parents.forEach((parents, id) => {
      ids.add(id);

      parents.forEach((parent) => {
        if (parent !== ROOT) {
          ids.add(parent);
        }
      });
    });

    return ids;
  }

  // Everything that can reach a changed id, which is everything holding a
  //  rebuilt object that is now out of date. Their memo entries and edges go
  //  now; the walk records the edges again for whatever is still referenced.
  //  Returns whether there is anything to rebuild.
  #invalidate(changedIds: Iterable<string>): boolean {
    const invalid = new Set<Id>(changedIds),
      queue = [...invalid],
      children = this.#children;

    if (invalid.size === 0) {
      return false;
    }

    // Only the walk from the root rebuilds anything, so it always runs; it
    //  stops wherever it meets an object still valid.
    invalid.add(ROOT);

    for (let i = 0; i < queue.length; i++) {
      const id = queue[i] as string;

      this.#parents.get(id)?.forEach((parent) => {
        if (invalid.has(parent)) {
          return;
        }

        if (!children.get(parent)?.has(id)) {
          this.#parents.get(id)!.delete(parent);

          return;
        }

        invalid.add(parent);

        if (parent !== ROOT) {
          queue.push(parent);
        }
      });
    }

    invalid.forEach((id) => {
      children.delete(id);

      if (id !== ROOT) {
        this.#memo.delete(id);
      }
    });

    return true;
  }
}

const isRef = (value: any): value is { '#ref': string } =>
  !!value && !!value['#ref'];

export default IncrementalReconstituter;
