import { Request, RequestArgs, RequestReturn } from './Request';
import {
  Transport,
  TransportData,
  TransportDisposer,
  TransportReceiveHandler,
  TransportSendArgs,
} from './Transport';

export abstract class AbstractTransport<
  DataMap extends {
    [key: string]: TransportData;
  }
> implements Transport<DataMap>
{
  abstract receive<Channel extends keyof DataMap>(
    channel: Channel,
    handler: TransportReceiveHandler<DataMap[Channel]>
  ): TransportDisposer;

  abstract receiveOnce<Channel extends keyof DataMap>(
    channel: Channel,
    handler: TransportReceiveHandler<DataMap[Channel]>
  ): TransportDisposer;

  async request<
    RequestType extends Request,
    Args extends any[] = RequestArgs<RequestType>,
    Return extends any = RequestReturn<RequestType>
  >(request: Request): Promise<Return> {
    return new Promise<Return>((resolve) => {
      this.send(request.channel(), request.args()[0]);

      this.receiveOnce(request.channel(), (value: Return) => resolve(value));
    });
  }

  abstract send<Channel extends keyof DataMap>(
    channel: Channel,
    data: TransportSendArgs<DataMap[Channel]>
  ): void;
}

export default AbstractTransport;
