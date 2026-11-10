import {
  DBSchema,
  IDBPDatabase,
  StoreKey,
  StoreNames,
  StoreValue,
} from 'idb/build/entry';
import { openDB } from 'idb';

export interface Record {
  [key: string]: any;
}

export class Store<Types extends DBSchema> {
  #connection: Promise<IDBPDatabase<Types>>;
  #store: StoreNames<Types>;

  constructor(
    db: string,
    store: StoreNames<Types>,
    options?: IDBObjectStoreParameters
  ) {
    this.#store = store;

    // Opened inside a promise, so a browser that refuses the database outright (storage blocked) rejects here rather
    //  than throwing as the store is made, which for a store made as its module loads stopped the page (#850).
    this.#connection = Promise.resolve().then(() =>
      openDB(db, 1, {
        upgrade: (db) => db.createObjectStore(this.#store, options),
      })
    );
    // Whoever uses the store hears of it then; nobody may be listening yet.
    this.#connection.catch((): void => {});
  }

  /**
   * Whether the browser let the database be opened. A browser that blocks this site's data doesn't (#850). Only the
   * opening is asked about: a read that fails later, for some passing reason, says nothing of that.
   */
  async opens(): Promise<boolean> {
    try {
      await this.#connection;

      return true;
    } catch {
      return false;
    }
  }

  async get(key: StoreKey<Types, StoreNames<Types>>) {
    return (await this.#connection).get(this.#store, key);
  }

  async getAll(
    query?: StoreKey<Types, StoreNames<Types>> | IDBKeyRange | null,
    count?: number
  ) {
    return (await this.#connection).getAll(this.#store, query, count);
  }

  async set(
    record: StoreValue<Types, StoreNames<Types>>,
    key?: StoreKey<Types, StoreNames<Types>>
  ) {
    return (await this.#connection).put(this.#store, record, key);
  }

  async setAll(records: StoreValue<Types, StoreNames<Types>>[]) {
    const transaction = (await this.#connection).transaction(
      this.#store,
      'readwrite'
    );

    await Promise.all([
      ...records.map((record) => transaction.store.put(record)),
      transaction.done,
    ]);
  }

  async delete(key: StoreKey<Types, StoreNames<Types>>) {
    return (await this.#connection).delete(this.#store, key);
  }

  async clear() {
    return (await this.#connection).clear(this.#store);
  }

  async keys() {
    return (await this.#connection).getAllKeys(this.#store);
  }
}
