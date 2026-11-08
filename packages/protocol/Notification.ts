import DataObject from '@civ-clone/core-data-object/DataObject';

export class Notification extends DataObject {
  #bubble: boolean;
  #data: any;
  #key: string;

  // A `bubble` notification waits as a button beside End Turn instead of opening a window, for news that needs no
  //  decision and should not stop play.
  constructor(key: string, data: any, bubble: boolean = false) {
    super();

    this.#bubble = bubble;
    this.#data = data;
    this.#key = key;

    this.addKey('bubble', 'data', 'key');
  }

  bubble(): boolean {
    return this.#bubble;
  }

  data(): any {
    return this.#data;
  }

  key(): string {
    return this.#key;
  }
}

export default Notification;
