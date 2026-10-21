import { GameData } from '../types';

// Which ids changed between two renders, and who wants to know (#344). The
//  renderer `collect`s what each rebuild filled and `notify`s once per render,
//  where `dataupdated` is dispatched; a window `watch`es the ids it shows and
//  is handed the new data when any of them changed.
//
// A module singleton, as `GameOptionsRegistry.instance` is, because windows
//  are opened from too many places to hand one through. The class stays
//  constructible for the tests.

/** The ids a watcher shows, read at notify time, after the refill. */
export type WatchedIds = () => Iterable<string>;
export type ChangeHandler = (data: GameData) => void;

type Watcher = {
  ids: WatchedIds;
  handler: ChangeHandler;
  watching: boolean;
};

export class DataChanges {
  #changed: Set<string> = new Set();
  // A rebuild of everything since the last `notify`: every watcher wakes.
  #everything = false;
  #watchers: Watcher[] = [];

  /** After each rebuild: the ids it changed, or `null` for a rebuild of everything. Accumulates until `notify`. */
  collect(ids: Iterable<string> | null): void {
    if (ids === null) {
      this.#everything = true;
      this.#changed.clear();

      return;
    }

    if (this.#everything) {
      return;
    }

    for (const id of ids) {
      this.#changed.add(id);
    }
  }

  /**
   * Once per render, before the HUD is rebuilt. Each watcher whose ids changed since the last call runs once, in
   * registration order, over a snapshot: a watcher removed by an earlier one in the same pass is skipped; one added
   * during the pass waits for the next.
   */
  notify(data: GameData): void {
    const changed = this.#changed,
      everything = this.#everything;

    // Taken before any watcher runs: one can close a window whose `close`
    //  rebuilds again (the arrival window's does), and what that rebuild
    //  collects is for the next render.
    this.#changed = new Set();
    this.#everything = false;

    if (!everything && changed.size === 0) {
      return;
    }

    const watchers = this.#watchers.slice();

    for (let i = 0; i < watchers.length; i++) {
      const watcher = watchers[i];

      if (!watcher.watching) {
        continue;
      }

      // As a `document` listener's error is reported without stopping the
      //  others or the dispatch, so the render goes on.
      try {
        if (everything || intersects(watcher.ids(), changed)) {
          watcher.handler(data);
        }
      } catch (error) {
        console.error(error);
      }
    }
  }

  /** `ids` is read at notify time, after the refill, so a window follows its city's new units without re-subscribing. */
  watch(ids: WatchedIds, handler: ChangeHandler): () => void {
    const watcher: Watcher = { ids, handler, watching: true };

    this.#watchers.push(watcher);

    return (): void => {
      if (!watcher.watching) {
        return;
      }

      watcher.watching = false;
      this.#watchers.splice(this.#watchers.indexOf(watcher), 1);
    };
  }
}

const intersects = (ids: Iterable<string>, changed: Set<string>): boolean => {
  for (const id of ids) {
    if (changed.has(id)) {
      return true;
    }
  }

  return false;
};

export const instance = new DataChanges();

export default DataChanges;
