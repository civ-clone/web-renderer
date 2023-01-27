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
  #ids: string[] = [];

  constructor(ids: string[], handler: dataUpdatedHandler) {
    this.setIds(ids);

    this.#handler = (event) => {
      const { detail } = event,
        objects = detail.value.objects;

      if (!objects) {
        return;
      }

      if (this.#ids.some((id) => id in objects)) {
        document.addEventListener(
          'dataupdated',
          (event) => handler(event.detail.data),
          {
            once: true,
          }
        );
      }
    };

    document.addEventListener('patchdatareceived', this.#handler);
  }

  dispose(): void {
    document.removeEventListener('patchdatareceived', this.#handler);
  }

  setIds(ids: string[]): void {
    this.#ids.splice(0, this.#ids.length, ...ids);
  }
}

export default DataObserver;
