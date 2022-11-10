export type TransportMessage = {
  channel: string;
  data: any;
};

export interface Transport {
  receive(channel: string, handler: (...args: any[]) => void): void;
  receiveOnce(channel: string, handler: (...args: any[]) => void): void;
  send(channel: string, data?: any): void;
}

export default Transport;
