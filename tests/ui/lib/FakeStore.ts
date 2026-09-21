// Stands in for `src/js/UI/Store.ts` — see `tools/saved-game.js`, which
// resolves that module here when bundling the saved-game suite.
//
// Node has no `indexedDB`, and `idb` type-checks its own wrappers with
// `instanceof IDBDatabase` and friends, so a shim faithful enough to run it
// would be more machinery than the thing under test. What the suite is about
// is what crosses the reload, and what the player is told when it cannot.

const records = new Map<string, any>();

let failure: Error | null = null;

/** Makes every call reject, as a browser refusing storage would. */
export const failStore = (error: Error | null): void => {
  failure = error;
};

export const storedRecords = (): Map<string, any> => records;

export const resetStore = (): void => {
  records.clear();
  failure = null;
};

export class Store<Types> {
  async get(key: string) {
    if (failure) {
      throw failure;
    }

    return records.get(key);
  }

  async getAll() {
    if (failure) {
      throw failure;
    }

    return [...records.values()];
  }

  async set(record: any, key?: string) {
    if (failure) {
      throw failure;
    }

    records.set(key as string, record);

    return key;
  }

  async clear() {
    if (failure) {
      throw failure;
    }

    records.clear();
  }

  async keys() {
    if (failure) {
      throw failure;
    }

    return [...records.keys()];
  }
}
