// Stands in for `src/js/UI/Store.ts` — see `tools/saved-game.js`, which
// resolves that module here when bundling the saved-game suite.
//
// Node has no `indexedDB`, and `idb` type-checks its own wrappers with
// `instanceof IDBDatabase` and friends, so a shim faithful enough to run it
// would be more machinery than the thing under test. What the suite is about
// is what crosses the reload, and what the player is told when it cannot.

const records = new Map<string, any>();

let failure: Error | null = null,
  failing: string[] | null = null;

/** Makes every call reject, as a browser refusing storage would, or only the calls named. */
export const failStore = (
  error: Error | null,
  only: string[] | null = null
): void => {
  failure = error;
  failing = only;
};

const fails = (call: string): Error | null =>
  failure !== null && (failing === null || failing.includes(call))
    ? failure
    : null;

// How many records fit before a new one is refused, as full storage refuses it, or `null` for no limit.
let capacity: number | null = null;

export const limitStore = (records: number | null): void => {
  capacity = records;
};

export const storedRecords = (): Map<string, any> => records;

export const resetStore = (): void => {
  records.clear();
  failure = null;
  failing = null;
  capacity = null;
};

export class Store<Types> {
  async get(key: string) {
    if (fails('get')) {
      throw fails('get');
    }

    return records.get(key);
  }

  async getAll() {
    if (fails('getAll')) {
      throw fails('getAll');
    }

    return [...records.values()];
  }

  async set(record: any, key?: string) {
    if (fails('set')) {
      throw fails('set');
    }

    if (
      capacity !== null &&
      !records.has(key as string) &&
      records.size >= capacity
    ) {
      throw Object.assign(new Error('the quota has been exceeded'), {
        name: 'QuotaExceededError',
      });
    }

    records.set(key as string, record);

    return key;
  }

  async delete(key: string) {
    if (fails('delete')) {
      throw fails('delete');
    }

    records.delete(key);
  }

  async clear() {
    if (fails('clear')) {
      throw fails('clear');
    }

    records.clear();
  }

  async keys() {
    if (fails('keys')) {
      throw fails('keys');
    }

    return [...records.keys()];
  }
}
