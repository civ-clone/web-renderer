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

    this.#connection = openDB(db, 1, {
      upgrade: (db) => db.createObjectStore(this.#store, options),
    });
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

  async clear() {
    return (await this.#connection).clear(this.#store);
  }

  async keys() {
    return (await this.#connection).getAllKeys(this.#store);
  }
}
