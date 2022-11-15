import { Request, RequestArgs, RequestReturn } from './Request';
import Transport from './Transport';

export abstract class AbstractTransport implements Transport {
  abstract receive(channel: string, handler: (...args: any[]) => void): void;
  abstract receiveOnce(
    channel: string,
    handler: (...args: any[]) => void
  ): void;

  async request<
    RequestType extends Request,
    Args extends any[] = RequestArgs<RequestType>,
    Return extends any = RequestReturn<RequestType>
  >(request: Request): Promise<Return> {
    return new Promise<Return>((resolve) => {
      this.send(request.channel(), ...request.args());

      this.receiveOnce(request.channel(), (value: Return) => resolve(value));
    });
  }

  abstract send(channel: string, data?: any): void;
}

export default AbstractTransport;
