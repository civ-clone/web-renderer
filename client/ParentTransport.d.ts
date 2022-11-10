import Transport from './Transport';
export declare class ParentTransport implements Transport {
  receive(receivingChannel: string, handler: (...args: any[]) => void): void;
  receiveOnce(
    receivingChannel: string,
    handler: (...args: any[]) => void
  ): void;
  send(channel: string, data: any): void;
}
export default ParentTransport;
