import Transport from './Transport';
export declare class WorkerTransport implements Transport {
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
