// A request's reply is matched to it by id, and a worker that says nothing while a request waits is reported (#470).
//
// Before each request carried an id, a reply was matched to its request by channel alone. Drives `AbstractTransport`
// over a stub whose messages the test sends, in the order it likes, with timers it runs out by hand, then the real
// pair: `ParentTransport` and `answer` on the worker's side, wired to `WorkerTransport` on a stand-in `Worker`, to
// check the round trip on the wire and that what goes wrong reaches the `workerError` listeners, which open the
// "Something went wrong" window, once.

import AbstractTransport, {
  RequestFailed,
  TransportTimers,
  defaultSilenceTimeout,
} from '../../src/js/Engine/AbstractTransport';
import ParentTransport from '../../src/js/Engine/ParentTransport';
import Request from '../../src/js/Engine/Request';
import WorkerTransport from '../../src/js/Engine/WorkerTransport';
import answer from '../../src/js/Engine/answer';

type Handler = (data: any, meta?: { id?: number }) => void;

const failures: string[] = [];

const check = (what: string, ok: boolean, detail: string = ''): void => {
  if (!ok) {
    failures.push(`${what}${detail ? `: ${detail}` : ''}`);
  }
};

// A run that stops before it reports has checked nothing: a request that never settles leaves node nothing to wait for
//  (#473).
let finished = false;

process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write('FAIL requestIds: stopped before the checks ran\n');
    process.exitCode = 1;
  }
});

// Timers that only run out when the test says so.
class ManualTimers implements TransportTimers {
  #next = 1;
  pending: Map<number, { callback: () => void; timeout: number }> = new Map();

  set(callback: () => void, timeout: number): number {
    const handle = this.#next++;

    this.pending.set(handle, { callback, timeout });

    return handle;
  }

  clear(handle: unknown): void {
    this.pending.delete(handle as number);
  }

  timeouts(): number[] {
    return [...this.pending.values()].map(({ timeout }) => timeout);
  }

  runOut(): void {
    const pending = [...this.pending.values()];

    this.pending.clear();
    pending.forEach(({ callback }) => callback());
  }
}

class StubTransport extends AbstractTransport<any> {
  #listeners: Map<string, Handler[]> = new Map();
  sent: [string, any, number | undefined][] = [];
  rejected: RequestFailed[] = [];
  silences: string[][] = [];

  get waiting(): number {
    return this.outstanding;
  }

  receive(channel: PropertyKey, handler: Handler) {
    const listeners = this.#listeners.get(String(channel)) ?? [];

    listeners.push(handler);
    this.#listeners.set(String(channel), listeners);

    return (): void => {
      listeners.splice(listeners.indexOf(handler), 1);
    };
  }

  receiveOnce(channel: PropertyKey, handler: Handler) {
    const dispose = this.receive(channel, (...args) => {
      dispose();
      handler(...args);
    });

    return dispose;
  }

  protected post(channel: PropertyKey, data: any, id?: number): void {
    this.sent.push([String(channel), data, id]);
  }

  // A message from the worker, heard by every listener on its channel.
  deliver(channel: string, data: any, id?: number): void {
    this.heard();

    [...(this.#listeners.get(channel) ?? [])].forEach((listener) =>
      listener(data, { id })
    );
  }

  // The id a request was sent with.
  idOf(channel: string, data: any): number {
    const sent = this.sent.find(
      ([sentChannel, sentData]) => sentChannel === channel && sentData === data
    );

    return sent![2]!;
  }

  protected requestRejected(error: RequestFailed): void {
    this.rejected.push(error);
  }

  protected notAnswering(channels: string[]): void {
    this.silences.push(channels);
  }
}

class Ask extends Request<[any], any> {
  constructor(channel: string, value?: any) {
    super(channel, value);
  }
}

// Lets every settled promise's handlers, and every message already posted, run.
const flush = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

// How a promise stands, without waiting on it.
const track = <T>(promise: Promise<T>) => {
  const state: { status: string; value?: T; reason?: any } = {
    status: 'pending',
  };

  promise.then(
    (value) => Object.assign(state, { status: 'fulfilled', value }),
    (reason) => Object.assign(state, { status: 'rejected', reason })
  );

  return state;
};

// Each `console.warn` while `during` runs.
const warnings = async (during: () => Promise<void>): Promise<string[]> => {
  const warned: string[] = [],
    warn = console.warn;

  console.warn = (...args: any[]) => warned.push(args.join(' '));

  try {
    await during();
  } finally {
    console.warn = warn;
  }

  return warned;
};

const run = async (): Promise<void> => {
  // Two waiting on one channel, answered out of order: each gets its own reply.
  {
    const transport = new StubTransport({ timers: new ManualTimers() }),
      first = track(transport.request(new Ask('builds', 'city-1'))),
      second = track(transport.request(new Ask('builds', 'city-2'))),
      firstId = transport.idOf('builds', 'city-1'),
      secondId = transport.idOf('builds', 'city-2');

    check(
      'each request is sent with an id of its own',
      typeof firstId === 'number' &&
        typeof secondId === 'number' &&
        firstId !== secondId,
      JSON.stringify(transport.sent)
    );
    check('two requests wait together', transport.waiting === 2);

    transport.deliver('builds', 'list-2', secondId);
    await flush();

    check(
      'the second reply, first, resolves the second request',
      second.status === 'fulfilled' && second.value === 'list-2',
      JSON.stringify(second)
    );
    check(
      'the first request still waits for its own',
      first.status === 'pending',
      JSON.stringify(first)
    );

    transport.deliver('builds', 'list-1', firstId);
    await flush();

    check(
      'the first reply resolves the first request',
      first.status === 'fulfilled' && first.value === 'list-1',
      JSON.stringify(first)
    );
    check(
      'no request is left waiting after replies out of order',
      transport.waiting === 0,
      `${transport.waiting}`
    );

    const warned = await warnings(async () => {
      transport.deliver('builds', 'again', firstId);
      transport.deliver('builds', 'stray', 999);
      await flush();
    });

    check(
      'a reply for a request that has had its reply, or for none, is dropped with a warning',
      warned.length === 2,
      JSON.stringify(warned)
    );
  }

  // Silence while requests wait is reported once, no more than once for each request, and a request still gets its
  //  reply when it comes.
  {
    const timers = new ManualTimers(),
      transport = new StubTransport({ timers }),
      lost = track(transport.request(new Ask('topCities', 'lost')));

    check(
      'silence is not timed before the worker has said anything',
      timers.pending.size === 0,
      JSON.stringify(timers.timeouts())
    );

    transport.deliver('ready', null);

    const armed = [...timers.pending.keys()];

    check(
      'silence is timed once the worker has said something, while a request waits',
      JSON.stringify(timers.timeouts()) ===
        JSON.stringify([defaultSilenceTimeout]),
      JSON.stringify(timers.timeouts())
    );

    const next = track(transport.request(new Ask('intelligence', 'next')));

    check(
      'a second request leaves the silence already timed alone',
      JSON.stringify([...timers.pending.keys()]) === JSON.stringify(armed),
      JSON.stringify([armed, [...timers.pending.keys()]])
    );

    const warned = await warnings(async () => {
      timers.runOut();
      await flush();
    });

    check(
      'one silence is reported once, with every channel waiting',
      JSON.stringify(transport.silences) ===
        JSON.stringify([['topCities', 'intelligence']]),
      JSON.stringify(transport.silences)
    );
    check(
      'the channels waiting go to the console',
      warned.length === 1 &&
        warned[0].includes('"topCities"') &&
        warned[0].includes('"intelligence"'),
      JSON.stringify(warned)
    );
    check(
      'a request is not given up on in a silence',
      lost.status === 'pending' &&
        next.status === 'pending' &&
        transport.waiting === 2,
      JSON.stringify([lost, next])
    );

    // The worker says something, but never answers: the requests already reported aren't reported again.
    transport.deliver('alive', null);

    check(
      'a request reported once is not timed again',
      timers.pending.size === 0,
      `${timers.pending.size}`
    );

    // A new request in the same quiet worker is timed, and reported on its own.
    const third = track(transport.request(new Ask('cityBuildAvailable', 'c')));

    check(
      'a new request is timed when the others have been reported',
      timers.pending.size === 1,
      `${timers.pending.size}`
    );

    await warnings(async () => {
      timers.runOut();
      await flush();
    });

    check(
      'a new request is reported on its own',
      JSON.stringify(transport.silences.slice(1)) ===
        JSON.stringify([['cityBuildAvailable']]),
      JSON.stringify(transport.silences)
    );

    transport.deliver('gameDataPatch', []);

    check(
      'and is not timed again either',
      timers.pending.size === 0,
      `${timers.pending.size}`
    );

    transport.deliver('topCities', 'rows', transport.idOf('topCities', 'lost'));
    transport.deliver(
      'intelligence',
      'report',
      transport.idOf('intelligence', 'next')
    );
    transport.deliver(
      'cityBuildAvailable',
      'builds',
      transport.idOf('cityBuildAvailable', 'c')
    );
    await flush();

    check(
      'replies after the silences were reported still resolve their requests',
      lost.value === 'rows' &&
        next.value === 'report' &&
        third.value === 'builds',
      JSON.stringify([lost, next, third])
    );
    check(
      'nothing is left waiting or timed once every request has its reply',
      transport.waiting === 0 && timers.pending.size === 0,
      `${transport.waiting}, ${timers.pending.size}`
    );

    transport.deliver('gameDataPatch', []);

    check(
      'silence is not timed when no request waits',
      timers.pending.size === 0,
      `${timers.pending.size}`
    );

    // A fresh request is timed, and a message from the worker times its silence afresh.
    const fresh = track(transport.request(new Ask('topCities', 'fresh')));
    const before = [...timers.pending.keys()];

    transport.deliver('gameDataPatch', []);

    check(
      'a message from the worker times the silence afresh',
      timers.pending.size === 1 &&
        JSON.stringify([...timers.pending.keys()]) !== JSON.stringify(before),
      JSON.stringify([before, [...timers.pending.keys()]])
    );

    transport.deliver('topCities', 'x', transport.idOf('topCities', 'fresh'));
    await flush();

    check(
      'and a reply ends it',
      fresh.status === 'fulfilled' && timers.pending.size === 0,
      `${fresh.status}, ${timers.pending.size}`
    );
  }

  // A request the worker could not answer still rejects with its error, and is reported; a stale failure is not.
  {
    const timers = new ManualTimers(),
      transport = new StubTransport({ timers }),
      failed = track(transport.request(new Ask('intelligence', 'one'))),
      other = track(transport.request(new Ask('intelligence', 'two'))),
      failedId = transport.idOf('intelligence', 'one');

    transport.deliver('requestFailed', {
      channel: 'intelligence',
      message: 'no embassies',
      id: failedId,
    });
    await flush();

    check(
      'a failed reply rejects with its error',
      failed.status === 'rejected' &&
        failed.reason instanceof RequestFailed &&
        failed.reason.message === 'no embassies',
      JSON.stringify(failed)
    );
    check(
      'a failed reply is reported',
      transport.rejected.length === 1 &&
        transport.rejected[0] === failed.reason,
      `${transport.rejected.length}`
    );
    check(
      'a failed reply leaves the other request on its channel waiting',
      other.status === 'pending',
      JSON.stringify(other)
    );

    const warned = await warnings(async () => {
      transport.deliver('requestFailed', {
        channel: 'intelligence',
        message: 'again',
        id: failedId,
      });
      transport.deliver('requestFailed', {
        channel: 'topCities',
        message: 'not yours',
        id: transport.idOf('intelligence', 'two'),
      });
      await flush();
    });

    check(
      'a failure for no waiting request is dropped with a warning, and not reported',
      other.status === 'pending' &&
        warned.length === 2 &&
        transport.rejected.length === 1,
      JSON.stringify([other, warned, transport.rejected.length])
    );

    transport.deliver(
      'intelligence',
      'report',
      transport.idOf('intelligence', 'two')
    );
    await flush();

    check(
      'nothing is left waiting or timed after a failure',
      other.status === 'fulfilled' &&
        transport.waiting === 0 &&
        timers.pending.size === 0,
      `${other.status}, ${transport.waiting}, ${timers.pending.size}`
    );
  }

  // On the wire: the worker's `ParentTransport` and `answer`, and the page's `WorkerTransport`, each message cloned as
  //  `postMessage` clones it and delivered on a later tick.
  {
    const pageListeners: { [type: string]: ((event: any) => void)[] } = {},
      workerListeners: ((event: any) => void)[] = [],
      toWorker: any[] = [],
      toPage: any[] = [],
      worker = {
        addEventListener: (type: string, listener: (event: any) => void) =>
          (pageListeners[type] ??= []).push(listener),
        removeEventListener: (type: string, listener: (event: any) => void) =>
          pageListeners[type]?.splice(pageListeners[type].indexOf(listener), 1),
        dispatchEvent: (event: any): boolean => {
          [...(pageListeners[event.type] ?? [])].forEach((listener) =>
            listener(event)
          );

          return true;
        },
        postMessage: (message: any): void => {
          toWorker.push(message);

          const data = structuredClone(message);

          setTimeout(() =>
            [...workerListeners].forEach((listener) => listener({ data }))
          );
        },
      },
      scope = globalThis as any;

    // The worker's global scope, which `ParentTransport` uses.
    scope.addEventListener = (type: string, listener: (event: any) => void) =>
      type === 'message' && workerListeners.push(listener);
    scope.removeEventListener = (
      type: string,
      listener: (event: any) => void
    ) =>
      type === 'message' &&
      workerListeners.splice(workerListeners.indexOf(listener), 1);
    scope.postMessage = (message: any): void => {
      toPage.push(message);

      const data = structuredClone(message);

      setTimeout(() => worker.dispatchEvent({ type: 'message', data }));
    };

    const timers = new ManualTimers(),
      page = new WorkerTransport<any>(worker as unknown as Worker, {
        timers,
      }),
      parent = new ParentTransport<TransportDataMap>(),
      heard: any[] = [],
      logged = console.error;
    let finishSlow: (value: string) => void = () => {};

    console.error = () => {};

    answer(parent, 'topCities', (limit): any => `rows:${limit}`);
    answer(parent, 'intelligence', () => {
      throw new Error('no embassies');
    });
    answer(
      parent,
      'civilizationScore',
      () => new Promise<any>((resolve) => (finishSlow = resolve))
    );

    page.receive('workerError', (data) => heard.push(data));

    parent.send('ready', null);
    await flush();

    const rows = track(page.request(new Ask('topCities', 5))),
      failed = track(page.request(new Ask('intelligence')));

    await flush();
    await flush();

    check(
      'a request goes over the wire with its id, and its reply comes back with it',
      typeof toWorker[0]?.id === 'number' &&
        toPage.some(
          ({ channel, id }) => channel === 'topCities' && id === toWorker[0].id
        ),
      JSON.stringify([toWorker, toPage])
    );
    check(
      'a request answered over the wire resolves with its reply',
      rows.status === 'fulfilled' && rows.value === 'rows:5',
      JSON.stringify(rows)
    );
    check(
      'a request the worker could not answer rejects with its error',
      failed.status === 'rejected' &&
        failed.reason instanceof RequestFailed &&
        failed.reason.message === 'no embassies',
      JSON.stringify(failed)
    );
    check(
      'the failure carries its id over the wire',
      toPage.some(
        ({ channel, data }) =>
          channel === 'requestFailed' && data.id === toWorker[1]?.id
      ),
      JSON.stringify(toPage)
    );
    check(
      'a failed request opens one window',
      JSON.stringify(heard) === JSON.stringify([{ message: 'no embassies' }]),
      JSON.stringify(heard)
    );

    const slow = track(page.request(new Ask('civilizationScore')));

    await flush();
    await warnings(async () => {
      timers.runOut();
      await flush();
    });

    check(
      'a worker silent while a request waits opens one window, in the page’s own words',
      JSON.stringify(heard.slice(1)) ===
        JSON.stringify([{ message: '', notAnswering: true }]),
      JSON.stringify(heard)
    );
    check(
      "the page's own window is not the worker saying something",
      timers.pending.size === 0,
      `${timers.pending.size}`
    );

    finishSlow('score');
    await flush();
    await flush();

    check(
      'a reply after the silence still resolves its request',
      slow.status === 'fulfilled' && slow.value === 'score',
      JSON.stringify(slow)
    );

    console.error = logged;
    delete scope.addEventListener;
    delete scope.removeEventListener;
    delete scope.postMessage;
  }

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL requestIds:\n${failures.map((line) => `  ${line}`).join('\n')}\n`
    );
    process.exit(1);
  }

  console.log(
    'PASS requestIds (replies matched by id out of order; stale and unknown replies dropped; silence timed only once the worker has spoken, reported once per silence and per request, without giving up on the request; a failed reply rejects and is reported once; ParentTransport, answer and WorkerTransport round trip ids over the wire; nothing left waiting)'
  );
};

run().catch((error) => {
  process.stderr.write(
    `FAIL requestIds: ${
      error instanceof Error ? error.stack ?? error.message : String(error)
    }\n`
  );
  process.exit(1);
});
