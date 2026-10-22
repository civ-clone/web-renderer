import { Request, RequestArgs, RequestReturn } from './Request';
import {
  RequestId,
  Transport,
  TransportData,
  TransportDisposer,
  TransportReceiveHandler,
  TransportFailure,
  TransportSendArgs,
  TransportMeta,
} from './Transport';

// What a request the worker could not answer rejects with (#470).
export class RequestFailed extends Error {
  readonly channel: string;

  constructor(channel: string, message: string) {
    super(message);

    this.name = 'RequestFailed';
    this.channel = channel;
  }
}

// How long the worker can say nothing while a request waits on it before the player is told (#470). The worker answers
//  a request once it is free, so one asked while the AI players take their turns waits for them: about a second each
//  late in a big game, and a few times that on a slow device. Nothing is given up on: a reply that comes after this
//  still resolves its request.
export const defaultSilenceTimeout = 30_000;

// The timers the silence is kept with, which a test stands in for to run one out without waiting.
export type TransportTimers = {
  set(callback: () => void, timeout: number): unknown;
  clear(handle: unknown): void;
};

export type AbstractTransportOptions = {
  timers?: TransportTimers;
};

const realTimers: TransportTimers = {
  set: (callback, timeout) => setTimeout(callback, timeout),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

type Outstanding = {
  channel: string;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  // Whether a silence has been reported while this request waited: once is enough, so that a request that is never
  //  answered can't open the window again every time the worker goes quiet.
  reported: boolean;
};

export abstract class AbstractTransport<
  DataMap extends {
    [key: string]: TransportData;
  }
> implements Transport<DataMap>
{
  #nextId: RequestId = 1;
  // Each request that has been sent and not yet answered or failed, by its id.
  #outstanding: Map<RequestId, Outstanding> = new Map();
  // The channels replies are listened for on, and `requestFailed`: one listener each, for as long as the transport is
  //  in use, so that a reply that answers no waiting request is still heard, and dropped.
  #listening: Set<PropertyKey> = new Set();
  #timers: TransportTimers;
  // Whether the other side has said anything yet: until it has, it may still be loading, and its silence means nothing.
  #heardFrom = false;
  // The silence being timed, while a request waits that no silence has been reported for.
  #silence: unknown = undefined;

  constructor({ timers = realTimers }: AbstractTransportOptions = {}) {
    this.#timers = timers;
  }

  abstract receive<Channel extends keyof DataMap>(
    channel: Channel,
    handler: TransportReceiveHandler<DataMap[Channel]>
  ): TransportDisposer;

  abstract receiveOnce<Channel extends keyof DataMap>(
    channel: Channel,
    handler: TransportReceiveHandler<DataMap[Channel]>
  ): TransportDisposer;

  // How many requests are waiting for their replies.
  protected get outstanding(): number {
    return this.#outstanding.size;
  }

  // Each request is sent with an id of its own, which the worker's reply echoes (`answer.ts`), so any number can be
  //  waiting on one channel at once and each gets its own reply, in whatever order they come (#324, #470).
  //
  // A request the worker could not answer is answered with a `requestFailed` with its id, which rejects it, and
  //  `requestRejected` tells the player. A request waits for its reply however long it takes, but when the worker has
  //  said nothing at all for `defaultSilenceTimeout` while one waits, `notAnswering` tells the player, once for each
  //  silence, and no more than once for each request.
  request<
    RequestType extends Request,
    Args extends any[] = RequestArgs<RequestType>,
    Return extends any = RequestReturn<RequestType>
  >(request: Request): Promise<Return> {
    const channel = request.channel(),
      id = this.#nextId++;

    this.#listen(channel);

    return new Promise<Return>((resolve, reject) => {
      this.#outstanding.set(id, { channel, resolve, reject, reported: false });

      try {
        this.post(channel, request.args()[0], id);
      } catch (error) {
        this.#settle(id);
        reject(error);

        return;
      }

      this.#watch();
    });
  }

  reply<Channel extends keyof DataMap>(
    channel: Channel,
    data: TransportSendArgs<DataMap[Channel]>,
    id: RequestId
  ): void {
    this.post(channel, data, id);
  }

  send<Channel extends keyof DataMap>(
    channel: Channel,
    data: TransportSendArgs<DataMap[Channel]>
  ): void {
    this.post(channel, data);
  }

  // Sends a message to the other side: `id` is the request it asks or answers, when it is one.
  protected abstract post<Channel extends keyof DataMap>(
    channel: Channel,
    data: TransportSendArgs<DataMap[Channel]>,
    id?: RequestId
  ): void;

  // The other side has sent a message, of any kind, so it is still there. Called by the transport for each one.
  protected heard(): void {
    this.#heardFrom = true;
    this.#stopWatching();
    this.#watch();
  }

  // A request the worker could not answer has rejected with `error`. Here for the page's transport to tell the player.
  protected requestRejected(error: RequestFailed): void {}

  // The worker has said nothing for `defaultSilenceTimeout` while requests on `channels` wait on it. Here for the
  //  page's transport to tell the player.
  protected notAnswering(channels: string[]): void {}

  // The requests waiting that no silence has been reported for.
  #unreported(): Outstanding[] {
    return [...this.#outstanding.values()].filter(({ reported }) => !reported);
  }

  // Times the silence, unless it is timed already, or nothing waits that it could be reported for.
  #watch(): void {
    if (
      !this.#heardFrom ||
      this.#silence !== undefined ||
      this.#unreported().length === 0
    ) {
      return;
    }

    this.#silence = this.#timers.set(() => {
      this.#silence = undefined;

      const unreported = this.#unreported();

      if (unreported.length === 0) {
        return;
      }

      unreported.forEach((outstanding) => (outstanding.reported = true));

      const channels = [...new Set(unreported.map(({ channel }) => channel))];

      console.warn(
        `The game has said nothing for ${
          defaultSilenceTimeout / 1000
        } seconds while requests on ${channels
          .map((channel) => `"${channel}"`)
          .join(', ')} wait for it.`
      );

      this.notAnswering(channels);
    }, defaultSilenceTimeout);
  }

  #stopWatching(): void {
    if (this.#silence === undefined) {
      return;
    }

    this.#timers.clear(this.#silence);
    this.#silence = undefined;
  }

  #listen(channel: PropertyKey): void {
    if (!this.#listening.has('requestFailed')) {
      this.#listening.add('requestFailed');

      this.receive(
        'requestFailed' as keyof DataMap,
        (failure: TransportFailure): void => {
          const outstanding = this.#take(
            failure?.channel,
            failure?.id,
            'requestFailed'
          );

          if (!outstanding) {
            return;
          }

          const error = new RequestFailed(failure.channel, failure.message);

          outstanding.reject(error);
          this.requestRejected(error);
        }
      );
    }

    if (this.#listening.has(channel)) {
      return;
    }

    this.#listening.add(channel);

    this.receive(
      channel as keyof DataMap,
      (value: any, { id }: TransportMeta = {}): void => {
        // Without an id it is no reply.
        if (id === undefined) {
          return;
        }

        this.#take(String(channel), id, 'reply')?.resolve(value);
      }
    );
  }

  // The request a reply or failure answers, no longer waiting, or nothing for one that answers no request waiting here.
  #take(
    channel: string,
    id: RequestId | undefined,
    what: string
  ): Outstanding | undefined {
    const outstanding =
      id === undefined ? undefined : this.#outstanding.get(id);

    if (!outstanding || outstanding.channel !== channel) {
      console.warn(
        `Dropped a ${what} on "${channel}" for request ${id}, which is not waiting.`
      );

      return undefined;
    }

    return this.#settle(id!);
  }

  #settle(id: RequestId): Outstanding | undefined {
    const outstanding = this.#outstanding.get(id);

    if (!outstanding) {
      return undefined;
    }

    this.#outstanding.delete(id);

    if (this.#unreported().length === 0) {
      this.#stopWatching();
    }

    return outstanding;
  }
}

export default AbstractTransport;
