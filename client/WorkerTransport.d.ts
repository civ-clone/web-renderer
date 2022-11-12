import AbstractTransport from './AbstractTransport';
export declare class WorkerTransport extends AbstractTransport {
  #private;
  constructor(worker: Worker);
  receive(receivingChannel: string, handler: (...args: any[]) => void): void;
  receiveOnce(
    receivingChannel: string,
    handler: (...args: any[]) => void
  ): void;
  send(channel: string, data: any): void;
}
export default WorkerTransport;
