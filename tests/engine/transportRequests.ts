// A transport's requests on one channel get their own replies, however many are in flight (#324).
//
// Before replies carried their request's id (#470), two production pickers asking for their cities' lists together
// would both have been given the first city's.
//
// Drives `AbstractTransport` over a stub that answers each request on a later tick, in the order asked, with its id,
// and checks that concurrent requests on one channel each get their own answer, that different channels do not wait on
// each other, and that a channel is free again after its reply. `requestIds` checks replies out of order and timeouts.

import AbstractTransport, {
  RequestFailed,
} from '../../src/js/Engine/AbstractTransport';
import answer from '../../src/js/Engine/answer';
import Request from '../../src/js/Engine/Request';

type Handler = (data: any, meta?: { id?: number }) => void;

const fail = (reason: string): never => {
  process.stderr.write(`FAIL transportRequests: ${reason}\n`);
  process.exit(1);

  throw new Error(reason);
};

// A run that stops before it reports has checked nothing: a request that never settles leaves node nothing to wait for
//  (#473).
let finished = false;

process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      'FAIL transportRequests: stopped before the checks ran\n'
    );
    process.exitCode = 1;
  }
});

class StubTransport extends AbstractTransport<any> {
  #listeners: Map<string, Handler[]> = new Map();
  sent: [string, any][] = [];

  receive(channel: PropertyKey, handler: Handler) {
    return this.#add(String(channel), handler, false);
  }

  receiveOnce(channel: PropertyKey, handler: Handler) {
    return this.#add(String(channel), handler, true);
  }

  protected post(channelName: PropertyKey, data: any, id?: number): void {
    const channel = String(channelName);

    this.sent.push([channel, data]);

    // Answered later, as a worker would, with the request's id, and with every listener on the channel hearing it, as
    //  `WorkerTransport` does. One asked to fail is answered as `answer` answers a handler that threw (#470).
    setTimeout(() => {
      const [replyChannel, reply] =
          data === 'fail'
            ? ['requestFailed', { channel, message: `${channel} failed`, id }]
            : [channel, `${channel}:${data}`],
        listeners = [...(this.#listeners.get(replyChannel) ?? [])];

      listeners.forEach((listener) => listener(reply, { id }));
    }, 5);
  }

  #add(channel: string, handler: Handler, once: boolean) {
    const listeners = this.#listeners.get(channel) ?? [],
      listener: Handler = (data, meta) => {
        if (once) {
          this.#remove(channel, listener);
        }

        handler(data, meta);
      };

    listeners.push(listener);
    this.#listeners.set(channel, listeners);

    return () => this.#remove(channel, listener);
  }

  #remove(channel: string, listener: Handler): void {
    const listeners = this.#listeners.get(channel) ?? [];

    listeners.splice(listeners.indexOf(listener), 1);
  }
}

class Ask extends Request<[string], string> {
  constructor(channel: string, id: string) {
    super(channel, id);
  }
}

const run = async (): Promise<void> => {
  const transport = new StubTransport();

  // Two on one channel, in flight together.
  const [first, second] = await Promise.all([
    transport.request(new Ask('builds', 'city-1')),
    transport.request(new Ask('builds', 'city-2')),
  ]);

  if (first !== 'builds:city-1' || second !== 'builds:city-2') {
    fail(`concurrent requests on one channel got [${first}, ${second}]`);
  }

  if (transport.sent.length !== 2) {
    fail(`${transport.sent.length} messages were sent for two requests`);
  }

  // Three at once, answered in the order asked.
  const three = await Promise.all(
    ['a', 'b', 'c'].map((id) => transport.request(new Ask('builds', id)))
  );

  if (three.join() !== 'builds:a,builds:b,builds:c') {
    fail(`three concurrent requests got [${three.join(', ')}]`);
  }

  // Another channel is not held up by one that is waiting.
  const order: string[] = [],
    slow = transport
      .request(new Ask('builds', 'slow'))
      .then(() => order.push('builds')),
    other = transport
      .request(new Ask('cities', 'quick'))
      .then(() => order.push('cities'));

  await Promise.all([slow, other]);

  if (order.length !== 2) {
    fail('a request on another channel did not complete');
  }

  // The channel is free again afterwards: a lone request still gets its own reply.
  const alone = await transport.request(new Ask('builds', 'alone'));

  if (alone !== 'builds:alone') {
    fail(`a lone request after the others got ${alone}`);
  }

  // A request the worker could not answer rejects, and frees its channel: the one behind it gets its own reply (#470).
  const [failed, after] = await Promise.allSettled([
    transport.request(new Ask('builds', 'fail')),
    transport.request(new Ask('builds', 'after')),
  ]);

  if (
    failed.status !== 'rejected' ||
    !(failed.reason instanceof RequestFailed) ||
    failed.reason.message !== 'builds failed'
  ) {
    fail(
      `a request answered with requestFailed settled as ${String(
        failed.status
      )}`
    );
  }

  if (after.status !== 'fulfilled' || after.value !== 'builds:after') {
    fail(`the request behind a failed one settled as ${JSON.stringify(after)}`);
  }

  // Another channel's failure is not this one's.
  const [otherFailed, mine] = await Promise.allSettled([
    transport.request(new Ask('cities', 'fail')),
    transport.request(new Ask('builds', 'mine')),
  ]);

  if (otherFailed.status !== 'rejected' || mine.status !== 'fulfilled') {
    fail("one channel's failure settled another's request");
  }

  // The worker's side: `answer` replies on the channel with what the handler gives, or a promise once it resolves, and
  //  with a `requestFailed` on that channel when it throws or rejects, each with the request's id (#470).
  const handlers: { [channel: string]: Handler } = {},
    replies: any[][] = [],
    worker = {
      receive: (channel: string, handler: Handler) => {
        handlers[channel] = handler;

        return () => {};
      },
      reply: (channel: string, data: any, id: number) =>
        replies.push([channel, data, id]),
      send: (channel: string, data: any) => replies.push([channel, data]),
    },
    logged = console.error;

  console.error = () => {};

  answer(worker as any, 'value', (data) => `value:${data}`);
  answer(worker as any, 'later', (data) => Promise.resolve(`later:${data}`));
  answer(worker as any, 'throws', () => {
    throw new Error('it threw');
  });
  answer(worker as any, 'rejects', () =>
    Promise.reject(new Error('it rejected'))
  );

  handlers.value('a', { id: 1 });

  if (JSON.stringify(replies) !== JSON.stringify([['value', 'value:a', 1]])) {
    fail(`answer sent ${JSON.stringify(replies)} for a value, not at once`);
  }

  handlers.later('b', { id: 2 });
  handlers.throws('c', { id: 3 });
  handlers.rejects('d', { id: 4 });
  // A message with no id is no request: answered as a plain message, and a failure goes only to the console.
  handlers.value('e');
  handlers.throws('f');

  await new Promise((resolve) => setTimeout(resolve, 0));

  console.error = logged;

  const expected = [
    ['value', 'value:a', 1],
    // A failure says which request it answers in itself, as it goes on its own channel.
    ['requestFailed', { channel: 'throws', message: 'it threw', id: 3 }],
    ['value', 'value:e'],
    ['later', 'later:b', 2],
    ['requestFailed', { channel: 'rejects', message: 'it rejected', id: 4 }],
  ];

  if (JSON.stringify(replies) !== JSON.stringify(expected)) {
    fail(`answer sent ${JSON.stringify(replies)}`);
  }

  finished = true;

  console.log(
    'PASS transportRequests (2, then 3 concurrent requests on one channel each got their own reply; another channel was not held up; a failed request rejected and freed its channel; answer replied, or said it failed)'
  );
};

run().catch((error) =>
  fail(error instanceof Error ? error.stack ?? error.message : String(error))
);
