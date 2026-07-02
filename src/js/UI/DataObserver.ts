import { GameData, PlainObject } from './types';
import { ObjectMap } from './lib/reconstituteData';

export type dataUpdatedEvent = CustomEvent<{ data: PlainObject }>;
export type dataUpdatedHandler = (data: GameData) => void;
export type patchDataReceivedEvent = CustomEvent<{ value: ObjectMap }>;

declare global {
  interface GlobalEventHandlersEventMap {
    dataupdated: dataUpdatedEvent;
    patchdatareceived: patchDataReceivedEvent;
  }
}

export class DataObserver {
  #handler: (event: patchDataReceivedEvent) => void;
  #updateHandler: (event: dataUpdatedEvent) => void;
  #pending: boolean = false;
  #ids: string[] = [];

  constructor(ids: string[], handler: dataUpdatedHandler) {
    this.setIds(ids);

    // A boolean flag (rather than stacking one-shot `dataupdated` listeners
    // per matching patch) ensures the handler runs at most once per update,
    // however many patches in the batch touched the observed ids.
    this.#handler = (event) => {
      const { detail } = event,
        objects = detail.value.objects;

      if (!objects) {
        return;
      }

      if (this.#ids.some((id) => id in objects)) {
        this.#pending = true;
      }
    };

    this.#updateHandler = (event) => {
      if (!this.#pending) {
        return;
      }

      this.#pending = false;

      handler(event.detail.data as GameData);
    };

    document.addEventListener('patchdatareceived', this.#handler);
    document.addEventListener('dataupdated', this.#updateHandler);
  }

  dispose(): void {
    document.removeEventListener('patchdatareceived', this.#handler);
    document.removeEventListener('dataupdated', this.#updateHandler);
  }

  setIds(ids: string[]): void {
    this.#ids.splice(0, this.#ids.length, ...ids);
  }
}

export default DataObserver;
