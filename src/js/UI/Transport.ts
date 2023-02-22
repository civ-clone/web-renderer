import { Entity, EntityInstance } from './types';
import {
  Transport as BaseTransport,
  TransportData,
  TransportReceiveArgs,
  TransportSendArgs,
} from '../Engine/Transport';
import { IConstructor } from '@civ-clone/core-registry/Registry';
import { IDataObject } from '@civ-clone/core-data-object/DataObject';

export type Transport = BaseTransport<{
  [Channel in keyof TransportDataMap]: TransportData<
    ObjectToDataType<TransportReceiveArgs<TransportDataMap[Channel]>>,
    ObjectToDataType<TransportSendArgs<TransportDataMap[Channel]>>
  >;
}>;

type ObjectToDataType<Object> = Object extends IConstructor
  ? Entity
  : Object extends IDataObject
  ? EntityInstance & {
      // Clear out `DataObject` methods that are never exported, ideally this would use the output from `keys()`...
      [Key in Exclude<
        keyof Object,
        'addKey' | 'keys' | 'sourceClass' | 'toPlainObject'
      >]: Object[Key] extends (...args: any[]) => any
        ? ObjectToDataType<ReturnType<Object[Key]>>
        : ObjectToDataType<Object[Key]>;
    }
  : Object extends Array<infer T>
  ? ObjectToDataType<T>[]
  : Object extends (...args: any[]) => any
  ? ReturnType<Object>
  : Object;

export default Transport;
