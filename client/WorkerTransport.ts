import Transport, {TransportMessage} from './Transport';

export class WorkerTransport implements Transport {
  #worker;

  constructor(worker: Worker) {
    this.#worker = worker;

    worker.addEventListener('message', ({ data: { channel, data } }) =>
      console.log('receiving from backend: ' + channel, data)
    );
  }

  receive(receivingChannel: string, handler: (...args: any[]) => void): void {
    this.#worker.addEventListener('message', ({ data: { channel, data } }) => {
      if (channel === receivingChannel) {
        handler(data);
      }
    });
  }

  receiveOnce(
    receivingChannel: string,
    handler: (...args: any[]) => void
  ): void {
    const onceHandler = ({ data: { channel, data } }: MessageEvent<TransportMessage>) => {
      if (channel === receivingChannel) {
        handler(data);

        this.#worker.removeEventListener('message', onceHandler);
      }
    };

    this.#worker.addEventListener(
      'message',
      onceHandler
    );
  }

  send(channel: string, data: any): void {
    console.log('sending to backend: ' + channel, data);
    this.#worker.postMessage({
      channel,
      data,
    });
  }
}

export default WorkerTransport;
