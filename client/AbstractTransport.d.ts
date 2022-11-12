import { Request, RequestArgs, RequestReturn } from './Request';
import Transport from './Transport';
export declare abstract class AbstractTransport implements Transport {
  abstract receive(channel: string, handler: (...args: any[]) => void): void;
  abstract receiveOnce(
    channel: string,
    handler: (...args: any[]) => void
  ): void;
  request<
    RequestType extends Request,
    Args extends any[] = RequestArgs<RequestType>,
    Return extends any = RequestReturn<RequestType>
  >(request: Request, ...args: Args): Promise<Return>;
  abstract send(channel: string, data?: any): void;
}
export default AbstractTransport;
