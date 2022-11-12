import AbstractTransport from './AbstractTransport';

export class ParentTransport extends AbstractTransport {
  receive(receivingChannel: string, handler: (...args: any[]) => void): void {
    addEventListener('message', ({ data: { channel, data } }) => {
      if (channel === receivingChannel) {
        handler(data);
      }
    });
  }

  receiveOnce(
    receivingChannel: string,
    handler: (...args: any[]) => void
  ): void {
    addEventListener(
      'message',
      ({ data: { channel, data } }) => {
        if (channel === receivingChannel) {
          handler(data);
        }
      },
      {
        once: true,
      }
    );
  }

  send(channel: string, data: any): void {
    postMessage({
      channel,
      data,
    });
  }
}

export default ParentTransport;
