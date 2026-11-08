import {
  RequestId,
  TransportDataMap,
  TransportDisposer,
  TransportMessage,
  TransportReceiveArgs,
  TransportReceiveHandler,
  TransportSendArgs,
} from '@civ-clone/core-data-client/Transport';
import AbstractTransport, {
  AbstractTransportOptions,
  RequestFailed,
} from '@civ-clone/core-data-client/AbstractTransport';
import DataObject from '@civ-clone/core-data-object/DataObject';
import reconstituteData from '@civ-clone/core-data-client/reconstituteData';

/** Something went wrong in the worker, or the page's own word that it has gone quiet while requests wait on it. */
export type WorkerError = {
  message: string;
  notAnswering?: boolean;
};

export type WorkerTransportOptions = AbstractTransportOptions & {
  /**
   * Channels whose data is handed over as it arrived, an `ObjectMap` and all, for a listener that rebuilds it itself:
   * every other channel's is rebuilt with `reconstituteData` first. civ.one's game data is one: its page rebuilds it
   * incrementally, so a rebuild here would be a second copy of several megabytes (civ-clone/web-renderer#333).
   */
  rawChannels?: Iterable<PropertyKey>;
  /**
   * The channel the worker's own uncaught errors, a request it could not answer and its silence are passed on to, as
   * `WorkerError`s, as though the worker had sent them. `workerError` unless given.
   */
  errorChannel?: PropertyKey;
};

/** The page's end of a transport over a web worker's messages. */
export class WorkerTransport<
  DataMap extends TransportDataMap
> extends AbstractTransport<DataMap> {
  #worker: Worker;
  #rawChannels: ReadonlySet<PropertyKey>;
  #errorChannel: PropertyKey;
  // Set while the page's own errors go to their listeners, which is not the worker saying anything.
  #passingOn = false;

  constructor(
    worker: Worker,
    {
      rawChannels = [],
      errorChannel = 'workerError',
      ...options
    }: WorkerTransportOptions = {}
  ) {
    super(options);

    this.#worker = worker;
    this.#rawChannels = new Set(rawChannels);
    this.#errorChannel = errorChannel;

    // Every message from the worker says it is still there (#470).
    worker.addEventListener('message', (): void => {
      if (!this.#passingOn) {
        this.heard();
      }
    });

    // An error the worker didn't catch, or a message that couldn't be read, reaches the page only as an event on the
    //  `Worker`, which nothing would hear (#470).
    worker.addEventListener('error', (event: ErrorEvent): void =>
      this.#passOn({ message: event.message ?? '' })
    );
    worker.addEventListener('messageerror', (): void =>
      this.#passOn({ message: '' })
    );
  }

  // Something went wrong that the worker didn't say, passed on to the error channel's listeners as though the worker
  //  had sent it (civ-clone/web-renderer#470).
  #passOn(error: WorkerError): void {
    this.#passingOn = true;

    try {
      this.#worker.dispatchEvent(
        new MessageEvent('message', {
          data: { channel: this.#errorChannel, data: error },
        })
      );
    } finally {
      this.#passingOn = false;
    }
  }

  // A request the worker could not answer, said as the worker's own errors are.
  protected requestRejected(error: RequestFailed): void {
    this.#passOn({ message: error.message });
  }

  // The worker has said nothing for a while with a request waiting on it. The page says so in its own words: the
  //  channels are no help to a player, and are in the console.
  protected notAnswering(): void {
    this.#passOn({ message: '', notAnswering: true });
  }

  receive<Channel extends keyof DataMap>(
    channel: Channel,
    handler: TransportReceiveHandler<DataMap[Channel]>
  ): TransportDisposer {
    const listener = ({
      data: { channel: receivingChannel, data, id },
    }: MessageEvent<TransportMessage<DataMap>>) => {
      // Only reconstitute payloads for the channel this listener cares about;
      // reconstituting first meant every listener rebuilt the full object
      // graph for every hierarchy-shaped message on any channel.
      if (channel !== receivingChannel) {
        return;
      }

      handler(
        this.#payload<TransportReceiveArgs<DataMap[Channel]>>(channel, data),
        {
          rawData: data,
          id,
        }
      );
    };

    this.#worker.addEventListener('message', listener);

    return () => {
      this.#worker.removeEventListener('message', listener);
    };
  }

  receiveOnce<Channel extends keyof DataMap>(
    channel: Channel,
    handler: TransportReceiveHandler<DataMap[Channel]>
  ): TransportDisposer {
    const onceHandler = ({
      data: { channel: receivingChannel, data, id },
    }: MessageEvent<TransportMessage<DataMap>>) => {
      if (channel !== receivingChannel) {
        return;
      }

      handler(
        this.#payload<TransportReceiveArgs<DataMap[Channel]>>(channel, data),
        {
          rawData: data,
          id,
        }
      );

      this.#worker.removeEventListener('message', onceHandler);
    };

    this.#worker.addEventListener('message', onceHandler);

    return () => {
      this.#worker.removeEventListener('message', onceHandler);
    };
  }

  // A message's data as a listener gets it: rebuilt from its `ObjectMap`, unless its channel is a raw one.
  #payload<Data>(channel: PropertyKey, data: any): Data {
    return data?.hierarchy && !this.#rawChannels.has(channel)
      ? (reconstituteData(data) as Data)
      : data;
  }

  protected post<Channel extends keyof DataMap>(
    channel: Channel,
    data: TransportSendArgs<DataMap[Channel]>,
    id?: RequestId
  ): void {
    if ((data as any) instanceof DataObject) {
      data = data.toPlainObject();
    }

    this.#worker.postMessage({
      channel,
      data,
      ...(id === undefined ? {} : { id }),
    });
  }
}

export default WorkerTransport;
