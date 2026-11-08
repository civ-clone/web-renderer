import {
  RequestId,
  TransportDataMap,
  TransportDisposer,
  TransportMessage,
  TransportReceiveHandler,
  TransportSendArgs,
} from '@civ-clone/core-data-client/Transport';
import AbstractTransport from '@civ-clone/core-data-client/AbstractTransport';
import DataObject from '@civ-clone/core-data-object/DataObject';

export type TransportEventListenerArg<
  DataMap extends TransportDataMap = TransportDataMap
> = {
  data: TransportMessage<DataMap>;
};

/** The worker's end of a transport over its messages, to the page that started it. */
export class ParentTransport<
  DataMap extends TransportDataMap
> extends AbstractTransport<DataMap> {
  receive<Channel extends keyof DataMap>(
    channel: Channel,
    handler: TransportReceiveHandler<DataMap[Channel]>
  ): TransportDisposer {
    const listener = ({
      data: { channel: receivingChannel, data, id },
    }: TransportEventListenerArg<DataMap>) => {
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
    }: MessageEvent<TransportMessage<DataMap>>) => {
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

  // `id` is the request this answers, when it is a reply (civ-clone/web-renderer#470).
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
