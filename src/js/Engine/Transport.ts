import { Request, RequestArgs, RequestReturn } from './Request';

export type TransportMessage = {
  channel: string;
  data: any;
};

export interface Transport {
  receive(channel: string, handler: (...args: any[]) => void): void;
  receiveOnce(channel: string, handler: (...args: any[]) => void): void;
  request<
    RequestType extends Request,
    Args extends any[] = RequestArgs<RequestType>,
    Return extends any = RequestReturn<RequestType>
  >(
    request: Request
  ): Promise<Return>;
  send(channel: string, data?: any): void;
}

export default Transport;
