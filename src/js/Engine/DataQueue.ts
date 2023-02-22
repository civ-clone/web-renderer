import { ObjectMap } from '@civ-clone/core-data-object/DataObject';

type DataPatchType = 'add' | 'remove' | 'update';

type DataPatchContents = {
  type: DataPatchType;
  index: string | null;
  value?: (() => ObjectMap) | ObjectMap;
};

export type DataPatch = {
  [id: string]: DataPatchContents;
};

export class DataQueue {
  #queue: DataPatch[] = [];

  add(
    targetId: string,
    value: DataPatchContents['value'],
    index: DataPatchContents['index'] = null
  ): void {
    this.#queue.push({
      [targetId]: {
        type: 'add' as DataPatchType,
        index,
        value,
      },
    });
  }

  clear(): void {
    this.#queue.splice(0);
  }

  remove(targetId: string, index: DataPatchContents['index'] = null): void {
    this.#queue.push({
      [targetId]: {
        type: 'remove' as DataPatchType,
        index,
      },
    });
  }

  // TODO: look at chunking the data transfer
  transferData(): DataPatch[] {
    return this.#queue.slice(0).map((patch) => {
      const patchData: DataPatch = {};

      Object.entries(patch).forEach(
        ([key, { type, index, value }]: [string, DataPatchContents]) => {
          patchData[key] = {
            type,
            index,
            value: typeof value === 'function' ? value() : value,
          };
        }
      );

      return patchData;
    });
  }

  update(
    targetId: string,
    value: DataPatchContents['value'],
    index: DataPatchContents['index'] = null
  ): void {
    this.#queue.push({
      [targetId]: {
        type: 'update' as DataPatchType,
        index,
        value,
      },
    });
  }
}

export default DataQueue;
