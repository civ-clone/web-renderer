import DataObject from '@civ-clone/core-data-object/DataObject';

export class Notification extends DataObject {
  #data: any;
  #key: string;

  constructor(key: string, data: any) {
    super();

    this.#data = data;
    this.#key = key;

    this.addKey('data', 'key');
  }

  data(): any {
    return this.#data;
  }

  key(): string {
    return this.#key;
  }
}

export default Notification;
