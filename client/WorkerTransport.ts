import AbstractTransport from './AbstractTransport';
import { TransportMessage } from './Transport';

export class WorkerTransport extends AbstractTransport {
  #worker;

  constructor(worker: Worker) {
    super();

    this.#worker = worker;
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
    const onceHandler = ({
      data: { channel, data },
    }: MessageEvent<TransportMessage>) => {
      if (channel === receivingChannel) {
        handler(data);

        this.#worker.removeEventListener('message', onceHandler);
      }
    };

    this.#worker.addEventListener('message', onceHandler);
  }

  send(channel: string, data: any): void {
    this.#worker.postMessage({
      channel,
      data,
    });
  }
}

export default WorkerTransport;
