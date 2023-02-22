import {
  TransportData,
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
  ): void {
    addEventListener(
      'message',
      ({
        data: { channel: receivingChannel, data },
      }: TransportEventListenerArg) => {
        if (channel === receivingChannel) {
          handler(data);
        }
      }
    );
  }

  receiveOnce<Channel extends keyof DataMap>(
    channel: Channel,
    handler: TransportReceiveHandler<DataMap[Channel]>
  ): void {
    const fullHandler = ({
      data: { channel: receivingChannel, data },
    }: MessageEvent<TransportMessage>) => {
      if (channel === receivingChannel) {
        handler(data);

        removeEventListener('message', fullHandler);
      }
    };

    addEventListener('message', fullHandler);
  }

  send<Channel extends keyof DataMap>(
    channel: Channel,
    data: TransportSendArgs<DataMap[Channel]>
  ): void {
    if ((data as any) instanceof DataObject) {
      data = data.toPlainObject();
    }

    postMessage({
      channel,
      data,
    });
  }
}

export default ParentTransport;
