import { ObjectMap } from '@civ-clone/core-data-object/DataObject';

type DataPatchType = 'add' | 'remove' | 'update';

type DataPatchContents = {
  type: DataPatchType;
  index?: string | null;
  value?: (() => ObjectMap) | ObjectMap;
};

export type DataPatch = {
  [id: string]: DataPatchContents;
};

export class DataQueue {
  #queue: DataPatch[] = [];

  public add(
    targetId: string,
    value: DataPatchContents['value'],
    index: DataPatchContents['index'] = null
  ): void {
    this.#queue.push({
      [targetId]: {
        type: 'add',
        index,
        value,
      },
    });
  }

  public clear(): void {
    this.#queue.splice(0);
  }

  public remove(
    targetId: string,
    index: DataPatchContents['index'] = null
  ): void {
    this.#queue.push({
      [targetId]: {
        type: 'remove',
        index,
      },
    });
  }

  // TODO: look at chunking the data transfer
  public transferData(): DataPatch[] {
    return this.#queue.slice(0).map((patch) => {
      const patchData: DataPatch = {};

      Object.entries(patch).forEach(([key, { type, index, value }]) => {
        patchData[key] = {
          type,
          index,
          value: typeof value === 'function' ? value() : value,
        } as DataPatchContents;
      });

      return patchData;
    });
  }

  public update(
    targetId: string,
    value: DataPatchContents['value'],
    index: DataPatchContents['index'] = null
  ): void {
    this.#queue.push({
      [targetId]: {
        type: 'update',
        index,
        value,
      },
    });
  }
}

export default DataQueue;
