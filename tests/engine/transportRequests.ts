// A transport's requests on one channel get their own replies, however many are in flight (#324).
//
// A reply is matched to its request by channel alone, and every `receiveOnce` on a channel fires on the next message
// there. Before `AbstractTransport.request` took one request per channel at a time, two production pickers asking for
// their cities' lists together would both have been given the first city's.
//
// Drives `AbstractTransport` over a stub that answers each request on a later tick, in the order asked, and checks that
// concurrent requests on one channel each get their own answer, that different channels do not wait on each other, and
// that a channel is free again after its reply.

import AbstractTransport from '../../src/js/Engine/AbstractTransport';
import Request from '../../src/js/Engine/Request';

type Handler = (data: any) => void;

const fail = (reason: string): never => {
  process.stderr.write(`FAIL transportRequests: ${reason}\n`);
  process.exit(1);

  throw new Error(reason);
};

class StubTransport extends AbstractTransport<any> {
  #listeners: Map<string, Handler[]> = new Map();
  sent: [string, any][] = [];

  receive(channel: string, handler: Handler) {
    return this.#add(channel, handler, false);
  }

  receiveOnce(channel: string, handler: Handler) {
    return this.#add(channel, handler, true);
  }

  send(channel: string, data: any): void {
    this.sent.push([channel, data]);

    // Answered later, as a worker would, with every listener on the channel hearing it, as `WorkerTransport` does.
    setTimeout(() => {
      const listeners = [...(this.#listeners.get(channel) ?? [])];

      listeners.forEach((listener) => listener(`${channel}:${data}`));
    }, 5);
  }

  #add(channel: string, handler: Handler, once: boolean) {
    const listeners = this.#listeners.get(channel) ?? [],
      listener: Handler = (data) => {
        if (once) {
          this.#remove(channel, listener);
        }

        handler(data);
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

  console.log(
    'PASS transportRequests (2, then 3 concurrent requests on one channel each got their own reply; another channel was not held up)'
  );
};

run().catch((error) =>
  fail(error instanceof Error ? error.stack ?? error.message : String(error))
);
