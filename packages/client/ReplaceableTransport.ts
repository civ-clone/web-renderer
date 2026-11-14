import Request, { RequestReturn } from '@civ-clone/core-data-client/Request';
import {
  RequestId,
  Transport,
  TransportDataMap,
  TransportDisposer,
  TransportReceiveHandler,
  TransportSendArgs,
} from '@civ-clone/core-data-client/Transport';

// A worker plays one set of plugins (#668): they register their rules as they are imported, and can't be taken out. So
//  a new game with another set needs another worker, and the page gets one without a reload: everything that listens
//  to the transport goes on listening, to the new worker.

/** A worker and the transport to it, as `ReplaceableTransport` starts each, with what ends it. */
export type Connection<DataMap extends TransportDataMap> = {
  transport: Transport<DataMap> & { dispose?: () => void };
  /** Ends the worker: what the transport stops listening to is still running until then. */
  end: () => void;
};

export type ReplaceableTransportOptions = {
  /**
   * Channels whose messages a new worker is sent again, in the order they were first sent: what the page told the old
   *  one that every game is played with (civ.one's `setOption`, the debug panel's automation).
   */
  replay?: Iterable<PropertyKey>;
};

/** A transport that can be given a new worker, which the page tells to start (`replace`). */
export interface Replaceable {
  replace(): void;
}

/** Whether `transport` can be given a new worker. */
export const isReplaceable = (transport: unknown): transport is Replaceable =>
  typeof (transport as Partial<Replaceable> | null)?.replace === 'function';

type Listener = {
  channel: PropertyKey;
  handler: TransportReceiveHandler<any>;
  once: boolean;
  stop: TransportDisposer;
};

/**
 * The page's transport to its worker, which `replace` swaps for a new worker's: each `receive` and `receiveOnce` not yet
 *  stopped listens to the new one, and the messages on the `replay` channels are sent to it again. Requests still
 *  waiting on the old worker are rejected, as a disposed transport rejects them, and the old worker is ended.
 */
export class ReplaceableTransport<DataMap extends TransportDataMap>
  implements Transport<DataMap>, Replaceable
{
  #connect: () => Connection<DataMap>;
  #connection: Connection<DataMap>;
  #listeners: Listener[] = [];
  #replay: ReadonlySet<PropertyKey>;
  #replayed: { channel: keyof DataMap; data: any }[] = [];

  constructor(
    connect: () => Connection<DataMap>,
    { replay = [] }: ReplaceableTransportOptions = {}
  ) {
    this.#connect = connect;
    this.#connection = connect();
    this.#replay = new Set(replay);
  }

  /** Ends the worker, and starts another, which everything listening hears from from now on. */
  replace(): void {
    const previous = this.#connection;

    this.#listeners.forEach((listener) => listener.stop());

    previous.transport.dispose?.();
    previous.end();

    this.#connection = this.#connect();

    this.#listeners.forEach((listener) => this.#bind(listener));
    this.#replayed.forEach(({ channel, data }) =>
      this.#connection.transport.send(channel, data)
    );
  }

  #bind(listener: Listener): void {
    const transport = this.#connection.transport;

    listener.stop = listener.once
      ? transport.receiveOnce(listener.channel as keyof DataMap, (...args) => {
          this.#forget(listener);
          listener.handler(...args);
        })
      : transport.receive(listener.channel as keyof DataMap, listener.handler);
  }

  #forget(listener: Listener): void {
    const index = this.#listeners.indexOf(listener);

    if (index !== -1) {
      this.#listeners.splice(index, 1);
    }
  }

  #listen<Channel extends keyof DataMap>(
    channel: Channel,
    handler: TransportReceiveHandler<DataMap[Channel]>,
    once: boolean
  ): TransportDisposer {
    const listener: Listener = { channel, handler, once, stop: () => {} };

    this.#listeners.push(listener);
    this.#bind(listener);

    return (): void => {
      this.#forget(listener);
      listener.stop();
    };
  }

  receive<Channel extends keyof DataMap>(
    channel: Channel,
    handler: TransportReceiveHandler<DataMap[Channel]>
  ): TransportDisposer {
    return this.#listen(channel, handler, false);
  }

  receiveOnce<Channel extends keyof DataMap>(
    channel: Channel,
    handler: TransportReceiveHandler<DataMap[Channel]>
  ): TransportDisposer {
    return this.#listen(channel, handler, true);
  }

  request<RequestType extends Request>(
    request: RequestType
  ): Promise<RequestReturn<RequestType>> {
    return this.#connection.transport.request(request);
  }

  reply<Channel extends keyof DataMap>(
    channel: Channel,
    data: TransportSendArgs<DataMap[Channel]>,
    id: RequestId
  ): void {
    this.#connection.transport.reply(channel, data, id);
  }

  send<Channel extends keyof DataMap>(
    channel: Channel,
    data: TransportSendArgs<DataMap[Channel]>
  ): void {
    if (this.#replay.has(channel)) {
      this.#replayed.push({ channel, data });
    }

    this.#connection.transport.send(channel, data);
  }
}

export default ReplaceableTransport;
