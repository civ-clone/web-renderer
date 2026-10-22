import { ObjectMap } from '@civ-clone/core-data-object/DataObject';

type DataPatchType = 'add' | 'remove' | 'update';

type DataPatchContents = {
  type: DataPatchType;
  index: string | null;
  // Built when the patch is sent, from the game as it is then. One that comes back `undefined` is left out: what it
  //  would have sent turned out to be unchanged (#411).
  value?: (() => ObjectMap | undefined) | ObjectMap;
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

  // TODO: look at chunking the data transfer
  transferData(): DataPatch[] {
    return this.#queue
      .slice(0)
      .map((patch) => {
        const patchData: DataPatch = {};

        Object.entries(patch).forEach(
          ([key, { type, index, value }]: [string, DataPatchContents]) => {
            let built;

            // One that throws is left out, and the rest go: thrown, it stopped the whole patch, and stayed queued, so
            //  every later one threw too and the UI heard nothing more for the rest of the game (#470).
            try {
              built = typeof value === 'function' ? value() : value;
            } catch (error) {
              console.error(error);

              return;
            }

            if (type !== 'remove' && built === undefined) {
              return;
            }

            patchData[key] = {
              type,
              index,
              value: built,
            };
          }
        );

        return patchData;
      })
      .filter((patchData) => Object.keys(patchData).length > 0);
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
