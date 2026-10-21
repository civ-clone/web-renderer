import { GameData } from './types';
import { instance as dataChanges } from './lib/DataChanges';

export type dataUpdatedHandler = (data: GameData) => void;

// Runs `handler` with the new data on the render after any of `ids` changed
//  (#344): added, updated, removed, or refilled because a ref it was waiting
//  for arrived, and on every render after a rebuild of everything. The ids are
//  read then, so `setIds` applies to the next render whenever it is called.
export class DataObserver {
  #ids: string[] = [];
  #unwatch: () => void;

  constructor(ids: string[], handler: dataUpdatedHandler) {
    this.setIds(ids);

    this.#unwatch = dataChanges.watch(
      () => this.#ids,
      (data) => handler(data)
    );
  }

  dispose(): void {
    this.#unwatch();
  }

  setIds(ids: string[]): void {
    this.#ids.splice(0, this.#ids.length, ...ids);
  }
}

export default DataObserver;
