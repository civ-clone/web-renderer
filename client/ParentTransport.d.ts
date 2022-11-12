import AbstractTransport from './AbstractTransport';
export declare class ParentTransport extends AbstractTransport {
  receive(receivingChannel: string, handler: (...args: any[]) => void): void;
  receiveOnce(
    receivingChannel: string,
    handler: (...args: any[]) => void
  ): void;
  send(channel: string, data: any): void;
}
export default ParentTransport;
