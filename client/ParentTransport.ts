import Transport, { TransportMessage } from './Transport';

addEventListener('message', ({ data: { channel, data } }) =>
  console.log('receiving from renderer: ' + channel, data)
);

export class ParentTransport implements Transport {
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
    console.log('sending to renderer: ' + channel, data);
    postMessage({
      channel,
      data,
    });
  }
}

export default ParentTransport;
