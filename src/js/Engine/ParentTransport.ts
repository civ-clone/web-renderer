import {
  RequestId,
  TransportData,
  TransportDisposer,
  TransportMessage,
  TransportReceiveHandler,
  TransportSendArgs,
} from './Transport';
import AbstractTransport from './AbstractTransport';
import DataObject from '@civ-clone/core-data-object/DataObject';

export type TransportEventListenerArg = {
  data: TransportMessage;
};

export class ParentTransport<
  DataMap extends {
    [key: string]: TransportData;
  }
> extends AbstractTransport<DataMap> {
  receive<Channel extends keyof DataMap>(
    channel: Channel,
    handler: TransportReceiveHandler<DataMap[Channel]>
  ): TransportDisposer {
    const listener = ({
      data: { channel: receivingChannel, data, id },
    }: TransportEventListenerArg) => {
      if (channel === receivingChannel) {
        handler(data, { id });
      }
    };

    addEventListener('message', listener);

    return () => {
      removeEventListener('message', listener);
    };
  }

  receiveOnce<Channel extends keyof DataMap>(
    channel: Channel,
    handler: TransportReceiveHandler<DataMap[Channel]>
  ): TransportDisposer {
    const fullHandler = ({
      data: { channel: receivingChannel, data, id },
    }: MessageEvent<TransportMessage>) => {
      if (channel === receivingChannel) {
        handler(data, { id });

        removeEventListener('message', fullHandler);
      }
    };

    addEventListener('message', fullHandler);

    return () => {
      removeEventListener('message', fullHandler);
    };
  }

  // `id` is the request this answers, when it is a reply: `answer` echoes it (#470).
  protected post<Channel extends keyof DataMap>(
    channel: Channel,
    data: TransportSendArgs<DataMap[Channel]>,
    id?: RequestId
  ): void {
    if ((data as any) instanceof DataObject) {
      data = data.toPlainObject();
    }

    postMessage({
      channel,
      data,
      ...(id === undefined ? {} : { id }),
    });
  }
}

export default ParentTransport;
