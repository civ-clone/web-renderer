// The game's data as it crosses from the worker to the page (#825): patches as the worker queues them, and the
//  object map the page rebuilds the game from.
import { ObjectMap as EngineObjectMap } from '@civ-clone/core-data-object/DataObject';
export type DataPatchType = 'add' | 'update';

export type DataPatchContents = {
  type: DataPatchType;
  index: string | null;
  // Built when the patch is sent, from the game as it is then. One that comes back `undefined` is left out: what it
  //  would have sent turned out to be unchanged (#411).
  value?: (() => EngineObjectMap | undefined) | EngineObjectMap;
};

export type DataPatch = {
  [id: string]: DataPatchContents;
};

export type PlainObject = {
  [key: string]: any;
};

export type ObjectStore = {
  [key: string]: PlainObject;
};

export type ObjectMap = {
  hierarchy: PlainObject;
  objects: ObjectStore;
};
