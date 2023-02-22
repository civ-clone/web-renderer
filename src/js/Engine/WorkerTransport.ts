import {
  TransportData,
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
  ): void {
    this.#worker.addEventListener(
      'message',
      ({ data: { channel: receivingChannel, data } }) => {
        const handlerData = data?.hierarchy
          ? (reconstituteData(data) as TransportReceiveArgs<DataMap[Channel]>)
          : data;

        if (channel === receivingChannel) {
          handler(handlerData, data);
        }
      }
    );
  }

  receiveOnce<Channel extends keyof DataMap>(
    channel: Channel,
    handler: TransportReceiveHandler<DataMap[Channel]>
  ): void {
    const onceHandler = ({
      data: { channel: receivingChannel, data },
    }: MessageEvent<TransportMessage>) => {
      const handlerData = data?.hierarchy
        ? (reconstituteData(data) as TransportReceiveArgs<DataMap[Channel]>)
        : data;

      if (channel === receivingChannel) {
        handler(handlerData, data);

        this.#worker.removeEventListener('message', onceHandler);
      }
    };

    this.#worker.addEventListener('message', onceHandler);
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
