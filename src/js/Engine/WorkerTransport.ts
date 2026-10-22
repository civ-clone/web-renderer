import {
  RequestId,
  TransportData,
  TransportDisposer,
  TransportMessage,
  TransportReceiveArgs,
  TransportReceiveHandler,
  TransportSendArgs,
  TransportWorkerError,
} from './Transport';
import AbstractTransport, {
  AbstractTransportOptions,
  RequestFailed,
} from './AbstractTransport';
import DataObject from '@civ-clone/core-data-object/DataObject';
import reconstituteData from '../UI/lib/reconstituteData';

// Channels whose message is handed over as it arrived. The listener builds the live game data from the map itself with
//  `IncrementalReconstituter`, so a rebuild here is a second copy of the same several megabytes, on the main thread,
//  for a loaded game (#333).
const rawChannels: ReadonlySet<PropertyKey> = new Set(['gameData']);

const payload = <Data>(channel: PropertyKey, data: any): Data =>
  data?.hierarchy && !rawChannels.has(channel)
    ? (reconstituteData(data) as Data)
    : data;

export class WorkerTransport<
  DataMap extends {
    [key: string]: TransportData;
  }
> extends AbstractTransport<DataMap> {
  #worker;
  // Set while the page's own `workerError` goes to its listeners, which is not the worker saying anything.
  #passingOn = false;

  constructor(worker: Worker, options: AbstractTransportOptions = {}) {
    super(options);

    this.#worker = worker;

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

  // Something went wrong that the worker didn't say, passed on to the `workerError` listeners as though the worker had
  //  sent it, as it does for a rejection nothing handled (#470).
  #passOn(error: TransportWorkerError): void {
    this.#passingOn = true;

    try {
      this.#worker.dispatchEvent(
        new MessageEvent('message', {
          data: { channel: 'workerError', data: error },
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
    }: MessageEvent<TransportMessage>) => {
      // Only reconstitute payloads for the channel this listener cares about;
      // reconstituting first meant every listener rebuilt the full object
      // graph for every hierarchy-shaped message on any channel.
      if (channel !== receivingChannel) {
        return;
      }

      handler(payload<TransportReceiveArgs<DataMap[Channel]>>(channel, data), {
        rawData: data,
        id,
      });
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
    }: MessageEvent<TransportMessage>) => {
      if (channel !== receivingChannel) {
        return;
      }

      handler(payload<TransportReceiveArgs<DataMap[Channel]>>(channel, data), {
        rawData: data,
        id,
      });

      this.#worker.removeEventListener('message', onceHandler);
    };

    this.#worker.addEventListener('message', onceHandler);

    return () => {
      this.#worker.removeEventListener('message', onceHandler);
    };
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
