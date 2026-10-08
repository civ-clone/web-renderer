import { ObjectMap, PlainObject } from './reconstituteData';

// The root `hierarchy` is not an id, but it can refer to an id the map does not
//  hold like any object can, so it waits for one under its own key.
const ROOT = Symbol('root');

type Owner = string | typeof ROOT;

// Rebuilds the live game data from its object map, touching only the ids a
//  patch changed (#322, #327). `reconstituteData` copies everything reachable
//  on every call, which on a late-game save is ~120k objects, when a patch
//  carries about a thousand of them.
//
// Each id has one rebuilt object for as long as the map holds it, and a change
//  refills that object in place: an array is emptied and pushed into again, an
//  object has its keys set again. Whatever holds it, the player's units, a
//  tile, the root, still holds the right object afterwards, so nothing that
//  refers to a changed id has to be rebuilt with it. Every action's patch
//  replaces the player, and units and cities all refer to their player.
//
// So a consumer holding a rebuilt object across an update sees its contents
//  change under it, the same as `data` itself. Inline objects (those without
//  an id) belong to the id they are in and are built afresh with it.
//
// The result must stay deep-equal to `reconstituteData`'s, which remains the
//  oracle for it (and the only rebuild for one-off messages).
export class IncrementalReconstituter {
  // The rebuilt object for every id reached since the last reset, kept until
  //  the map drops the id.
  #objects: Map<string, any> = new Map();
  // Ids whose raw value is a ref or not an object, which rebuild to something
  //  that isn't theirs to refill: what the ref points at, or the value.
  #aliases: Set<string> = new Set();
  // Ids referred to while the map did not hold them, and who referred to them.
  //  Those refs were left out, so the owners have to be refilled when the id
  //  arrives. Nothing else records who refers to what. An entry can outlive
  //  the ref it was recorded for, which costs one needless refill at most.
  #waiting: Map<string, Set<Owner>> = new Map();
  // The ids the last call filled, for `refilled`.
  #filled: Set<string> = new Set();
  #objectMap: ObjectMap | null = null;
  #root: PlainObject | undefined = undefined;
  // Whether `#root` is the root's own object rather than an id's.
  #rootIsInline = false;
  #built = false;

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

    const { objects } = objectMap,
      memo = this.#objects,
      aliases = this.#aliases,
      waiting = this.#waiting,
      filled = new Set<string>();

    this.#filled = filled;

    const wait = (id: string, owner: Owner): void => {
      const owners = waiting.get(id);

      if (owners) {
        owners.add(owner);

        return;
      }

      waiting.set(id, new Set([owner]));
    };

    const resolve = (id: string, owner: Owner): any => {
      const memoised = memo.get(id);

      if (memoised !== undefined || memo.has(id)) {
        return memoised;
      }

      if (!(id in objects)) {
        wait(id, owner);
        console.error(new TypeError(`missing ${id}`));

        return undefined;
      }

      const raw = objects[id];

      // An id that is only another ref has no object of its own to keep, so it
      //  takes the one it points at.
      if (!(raw instanceof Object) || isRef(raw)) {
        const updated = build(raw, id);

        aliases.add(id);
        memo.set(id, updated);

        return updated;
      }

      const updated: any = Array.isArray(raw) ? [] : {};

      // Before descending: the graph has cycles, and a ref back to this id
      //  from inside it has to find this object rather than start another.
      memo.set(id, updated);
      filled.add(id);

      fill(raw, updated, id);

      return updated;
    };

    // Plain loops from here on: this is the hot path, run for every value
    //  inside every filled id.
    const fill = (raw: any, updated: any, owner: Owner): void => {
      if (Array.isArray(raw)) {
        for (let i = 0; i < raw.length; i++) {
          // A hole, as setting an index past the end leaves, is skipped as
          //  `forEach` skips it in `reconstituteData`.
          if (!(i in raw)) {
            continue;
          }

          const value: any = raw[i];

          // A ref the frontend no longer holds is left out, as
          //  `reconstituteData` does (#46), until that id arrives.
          if (isRef(value) && !(value['#ref'] in objects)) {
            wait(value['#ref'], owner);
            console.error(new TypeError(`missing ${value['#ref']}`));

            continue;
          }

          updated.push(build(value, owner));
        }

        return;
      }

      for (const key in raw) {
        if (Object.prototype.hasOwnProperty.call(raw, key)) {
          updated[key] = build(raw[key], owner);
        }
      }
    };

    const build = (value: any, owner: Owner): any => {
      if (isRef(value)) {
        return resolve(value['#ref'], owner);
      }

      if (value instanceof Object) {
        const updated: any = Array.isArray(value) ? [] : {};

        fill(value, updated, owner);

        return updated;
      }

      return value;
    };

    // Empties a rebuilt object and fills it again from its raw value, which is
    //  the same kind (both arrays or both not).
    const refill = (raw: any, updated: any, owner: Owner): void => {
      if (Array.isArray(updated)) {
        updated.length = 0;

        fill(raw, updated, owner);

        return;
      }

      // Nearly always the same keys in the same order, which are set over
      //  rather than deleted first, so the object keeps its shape. Otherwise
      //  every key goes, so the keys end up in the order the raw value has
      //  them, as they would from `reconstituteData`.
      const keys = Object.keys(updated),
        rawKeys = Object.keys(raw);

      if (
        keys.length !== rawKeys.length ||
        keys.some((key, i) => key !== rawKeys[i])
      ) {
        for (let i = 0; i < keys.length; i++) {
          delete updated[keys[i]];
        }
      }

      fill(raw, updated, owner);
    };

    // A ref, as the game's `hierarchy` is, makes the root that id's object,
    //  which is refilled as that id. Otherwise the root is its own object, and
    //  refilled here.
    const buildRoot = (): void => {
      const { hierarchy } = objectMap,
        inline = hierarchy instanceof Object && !isRef(hierarchy);

      if (
        inline &&
        this.#rootIsInline &&
        Array.isArray(hierarchy) === Array.isArray(this.#root)
      ) {
        refill(hierarchy, this.#root, ROOT);

        return;
      }

      this.#root = build(hierarchy, ROOT);
      this.#rootIsInline = inline;
    };

    if (!this.#built) {
      this.#built = true;

      buildRoot();

      return this.#root!;
    }

    // Only the ids that changed are filled again, plus whatever was waiting
    //  for one of them to arrive. An id nothing has reached yet is left until
    //  something does.
    const queue: string[] = [],
      dropped = new Set<string>();

    let rebuildRoot = false,
      refillAll = false;

    // Before anything is filled, so that no fill finds an object about to be
    //  dropped or replaced.
    for (const id of changedIds ?? []) {
      const owners = waiting.get(id);

      if (owners && id in objects) {
        waiting.delete(id);

        owners.forEach((owner) => {
          if (owner === ROOT) {
            rebuildRoot = true;

            return;
          }

          // An alias that was waiting has been `undefined` to everything
          //  holding it, which nothing records: see below.
          if (aliases.has(owner)) {
            refillAll = true;

            return;
          }

          queue.push(owner);
        });
      }

      if (!memo.has(id)) {
        continue;
      }

      const memoised = memo.get(id),
        raw = objects[id];

      // Dropped, or an alias whose ref may now point elsewhere. Whatever holds
      //  the old object would have to let go of it, and nothing records who
      //  that is, so everything is filled again in place: as costly as a full
      //  rebuild, but the engine never removes an id, and its ids are never
      //  refs.
      if (!(id in objects) || aliases.has(id)) {
        memo.delete(id);
        aliases.delete(id);

        if (!(id in objects)) {
          dropped.add(id);
        }

        refillAll = true;

        continue;
      }

      // An object that has become an array, or the reverse, or a ref, cannot
      //  be refilled as itself: it gets a fresh object (or none, to resolve
      //  again), and everything is filled again to find whatever held the
      //  old one, as above.
      if (
        !(raw instanceof Object) ||
        isRef(raw) ||
        Array.isArray(raw) !== Array.isArray(memoised)
      ) {
        memo.delete(id);

        refillAll = true;

        continue;
      }

      queue.push(id);
    }

    if (dropped.size > 0) {
      this.#forgetOwners(dropped);
    }

    if (refillAll) {
      // An alias holds another id's object, which may be the one replaced, so
      //  each resolves again wherever it is reached.
      aliases.forEach((id) => memo.delete(id));
      aliases.clear();

      memo.forEach((updated, id) => queue.push(id));

      rebuildRoot = true;
    }

    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];

      // Already filled on this call, as a new id found inside another one is,
      //  or no longer held.
      if (filled.has(id) || !memo.has(id)) {
        continue;
      }

      filled.add(id);

      refill(objects[id], memo.get(id), id);
    }

    if (rebuildRoot) {
      buildRoot();
    }

    return this.#root!;
  }

  // Whether the last `rebuild` filled this id's object, whether afresh or in
  //  place: its contents may have changed even though the object has not.
  refilled(id: string): boolean {
    return this.#filled.has(id);
  }

  // For ids `pruneObjectMap` removed: nothing reachable referred to them, so
  //  nothing else needs filling again, but their entries would otherwise stay.
  forget(ids: Iterable<string>): void {
    const forgotten = new Set(ids);

    forgotten.forEach((id) => {
      this.#objects.delete(id);
      this.#aliases.delete(id);
    });

    this.#forgetOwners(forgotten);
  }

  reset(): void {
    this.#objects.clear();
    this.#aliases.clear();
    this.#waiting.clear();
    this.#filled = new Set();
    this.#objectMap = null;
    this.#root = undefined;
    this.#rootIsInline = false;
    this.#built = false;
  }

  // Every id the state still holds anything for, for the tests. Not the ids
  //  only waited for: the map does not hold those, so nothing is built for
  //  them.
  trackedIds(): Set<string> {
    const ids = new Set<string>(this.#objects.keys());

    this.#aliases.forEach((id) => ids.add(id));

    this.#waiting.forEach((owners) =>
      owners.forEach((owner) => {
        if (owner !== ROOT) {
          ids.add(owner);
        }
      })
    );

    return ids;
  }

  // Refs to ids the map never received leave entries nothing else would clear,
  //  once the ids that made them are gone.
  #forgetOwners(ids: Set<string>): void {
    this.#waiting.forEach((owners, id) => {
      owners.forEach((owner) => {
        if (owner !== ROOT && ids.has(owner)) {
          owners.delete(owner);
        }
      });

      if (owners.size === 0) {
        this.#waiting.delete(id);
      }
    });
  }
}

const isRef = (value: any): value is { '#ref': string } =>
  !!value && !!value['#ref'];

export default IncrementalReconstituter;
