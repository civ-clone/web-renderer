import {
  TransportData,
  TransportDisposer,
  TransportMessage,
  TransportReceiveArgs,
  TransportReceiveHandler,
  TransportSendArgs,
} from './Transport';
import AbstractTransport from './AbstractTransport';
import DataObject from '@civ-clone/core-data-object/DataObject';
import reconstituteData from '../UI/lib/reconstituteData';

export class WorkerTransport<
  DataMap extends {
    [key: string]: TransportData;
  }
> extends AbstractTransport<DataMap> {
  #worker;

  constructor(worker: Worker) {
    super();

    this.#worker = worker;
  }

  receive<Channel extends keyof DataMap>(
    channel: Channel,
    handler: TransportReceiveHandler<DataMap[Channel]>
  ): TransportDisposer {
    const listener = ({
      data: { channel: receivingChannel, data },
    }: MessageEvent<TransportMessage>) => {
      // Only reconstitute payloads for the channel this listener cares about;
      // reconstituting first meant every listener rebuilt the full object
      // graph for every hierarchy-shaped message on any channel.
      if (channel !== receivingChannel) {
        return;
      }

      const handlerData = data?.hierarchy
        ? (reconstituteData(data) as TransportReceiveArgs<DataMap[Channel]>)
        : data;

      handler(handlerData, data);
    };

    this.#worker.addEventListener('message', listener);

    return () => {
      this.#worker.removeEventListener('message', listener);
    };
  }

  receiveOnce<Channel extends keyof DataMap>(
    channel: Channel,
    handler: TransportReceiveHandler<DataMap[Channel]>
  ): TransportDisposer {
    const onceHandler = ({
      data: { channel: receivingChannel, data },
    }: MessageEvent<TransportMessage>) => {
      if (channel !== receivingChannel) {
        return;
      }

      const handlerData = data?.hierarchy
        ? (reconstituteData(data) as TransportReceiveArgs<DataMap[Channel]>)
        : data;

      handler(handlerData, data);

      this.#worker.removeEventListener('message', onceHandler);
    };

    this.#worker.addEventListener('message', onceHandler);

    return () => {
      this.#worker.removeEventListener('message', onceHandler);
    };
  }

  send<Channel extends keyof DataMap>(
    channel: Channel,
    data: TransportSendArgs<DataMap[Channel]>
  ): void {
    if ((data as any) instanceof DataObject) {
      data = data.toPlainObject();
    }

    this.#worker.postMessage({
      channel,
      data,
    });
  }
}

export default WorkerTransport;
