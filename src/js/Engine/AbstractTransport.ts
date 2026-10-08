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
  // The request each channel is waiting on, so that the next one waits its turn: see `request`.
  #pending: Map<keyof DataMap, Promise<unknown>> = new Map();

  abstract receive<Channel extends keyof DataMap>(
    channel: Channel,
    handler: TransportReceiveHandler<DataMap[Channel]>
  ): TransportDisposer;

  abstract receiveOnce<Channel extends keyof DataMap>(
    channel: Channel,
    handler: TransportReceiveHandler<DataMap[Channel]>
  ): TransportDisposer;

  // A reply is matched to its request by channel alone, and every `receiveOnce` on a channel fires on the next message
  //  there. Two requests on one channel in flight together would both resolve with the first reply (two production
  //  pickers open at once, each asking for its city's list, #324), so a channel takes one request at a time: the next
  //  is sent once the reply to the last has arrived. Different channels don't wait on each other.
  async request<
    RequestType extends Request,
    Args extends any[] = RequestArgs<RequestType>,
    Return extends any = RequestReturn<RequestType>
  >(request: Request): Promise<Return> {
    const channel = request.channel(),
      previous = this.#pending.get(channel) ?? Promise.resolve(),
      current = previous.then(
        () =>
          new Promise<Return>((resolve) => {
            this.receiveOnce(channel, (value: Return) => resolve(value));

            this.send(channel, request.args()[0]);
          })
      );

    this.#pending.set(channel, current);

    try {
      return await current;
    } finally {
      if (this.#pending.get(channel) === current) {
        this.#pending.delete(channel);
      }
    }
  }

  abstract send<Channel extends keyof DataMap>(
    channel: Channel,
    data: TransportSendArgs<DataMap[Channel]>
  ): void;
}

export default AbstractTransport;
