// The music player (src/js/Audio/Music.ts) with a stubbed AudioContext and worklet port (#126): nothing is made before
// the player's first key or click, and then only with an ASOUND.CVL and the sound on; the worklet gets the CVL, the
// volume and the tune asked for; stop is the driver's fade; and no CVL, no AudioWorklet, a module that won't load and a
// context that won't start are all silent, with nothing in the console. `soundGain` turns the options into the gain.

import Music, { MusicContext, MusicNode } from '../../src/js/Audio/Music';
import soundGain from '@civ-clone-ui/assets/lib/soundGain';

const failures: string[] = [];
let checks = 0,
  finished = false;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${description}\n    expected: ${JSON.stringify(
        expected
      )}\n    actual:   ${JSON.stringify(actual)}`
    );
  }
};

// A suite that stops before its checks would otherwise pass in silence (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(`FAIL music: stopped after ${checks} checks\n`);
    process.exitCode = 1;
  }
});

// Anything the player says in the console, which it should never.
const said: string[] = [];

(['error', 'warn', 'log', 'info'] as const).forEach((level) => {
  console[level] = (...args: unknown[]) =>
    said.push(`${level}: ${args.map(String).join(' ')}`);
});

const unhandled: unknown[] = [];

process.on('unhandledRejection', (error) => unhandled.push(error));

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

interface Stub {
  contexts: FakeContext[];
  nodes: FakeNode[];
  messages: any[];
}

class FakeContext implements MusicContext {
  state = 'suspended';
  destination = { destination: true };
  modules: string[] = [];
  resumes = 0;
  suspends = 0;
  audioWorklet?: { addModule(url: string): Promise<void> };

  constructor(
    {
      worklet = true,
      moduleFails = false,
      resumeFails = false,
      lag = false,
      blocked = false,
      refuseFirst = false,
    } = {},
    private readonly stub: Stub
  ) {
    this.resumeFails = resumeFails;
    this.lag = lag;
    this.blocked = blocked;
    this.refuseFirst = refuseFirst;

    if (worklet) {
      this.audioWorklet = {
        addModule: (url: string): Promise<void> => {
          this.modules.push(url);

          return moduleFails
            ? Promise.reject(new Error('The module could not be loaded.'))
            : Promise.resolve();
        },
      };
    }
  }

  private readonly resumeFails: boolean;
  // As Chrome does for a context made without the player's go-ahead: a resume waits, unanswered, until `allow()`.
  private blocked: boolean;
  private waiting: (() => void)[] = [];
  // As Safari does for a context made without the go-ahead: the first resume is refused.
  private refuseFirst: boolean;
  closed = false;

  allow(): void {
    this.blocked = false;
    this.state = 'running';
    this.waiting.splice(0).forEach((resolve) => resolve());
  }

  close(): Promise<void> {
    this.closed = true;
    this.state = 'closed';

    return Promise.resolve();
  }
  // As a browser does: `state` changes only once the audio thread has caught up, a little after the call.
  private readonly lag: boolean;

  #become(state: string): Promise<void> {
    if (!this.lag) {
      this.state = state;

      return Promise.resolve();
    }

    return new Promise((resolve) =>
      setTimeout(() => {
        this.state = state;
        resolve();
      }, 5)
    );
  }

  resume(): Promise<void> {
    this.resumes++;

    if (this.resumeFails) {
      return Promise.reject(new Error('Not allowed to start.'));
    }

    if (this.blocked) {
      return new Promise((resolve) => this.waiting.push(resolve));
    }

    if (this.refuseFirst) {
      this.refuseFirst = false;

      return Promise.reject(new Error('Not allowed to start.'));
    }

    return this.#become('running');
  }

  suspend(): Promise<void> {
    this.suspends++;

    return this.#become('suspended');
  }
}

class FakeNode implements MusicNode {
  connected: unknown[] = [];
  port: MusicNode['port'];

  constructor(private readonly stub: Stub) {
    this.port = {
      postMessage: (message: any) => stub.messages.push(message),
      onmessage: null,
    };
  }

  connect(destination: unknown): unknown {
    this.connected.push(destination);

    return destination;
  }

  reply(data: object): void {
    this.port.onmessage?.({ data });
  }
}

// A synthetic CVL's bytes: Music doesn't read them, it only passes them on.
const cvl = new Uint8Array([0x4d, 0x5a, 1, 2, 3]).buffer;

const player = ({
  sound = cvl as ArrayBuffer | null,
  gain = { value: 0.49 },
  context = {} as {
    worklet?: boolean;
    moduleFails?: boolean;
    resumeFails?: boolean;
    lag?: boolean;
    blocked?: boolean;
    refuseFirst?: boolean;
    throws?: boolean;
    none?: boolean;
  },
} = {}) => {
  const stub: Stub = { contexts: [], nodes: [], messages: [] },
    gestures = new EventTarget(),
    music = new Music({
      sound: async () => sound,
      gain: () => gain.value,
      workletUrl: 'dist/musicWorklet.js?v=test',
      gestureTarget: gestures,
      createContext: () => {
        if (context.throws) {
          throw new Error('No audio device.');
        }

        if (context.none) {
          return null;
        }

        const made = new FakeContext(context, stub);

        stub.contexts.push(made);

        return made;
      },
      createNode: () => {
        const node = new FakeNode(stub);

        stub.nodes.push(node);

        return node;
      },
    }),
    gesture = async (type = 'pointerdown') => {
      gestures.dispatchEvent(new Event(type));
      await settle();
    };

  return { stub, music, gesture, gain };
};

// Each message's kind and what it says, the CVL as its length.
const sent = (stub: Stub) =>
  stub.messages.map((message) =>
    message.load ? { load: message.load.byteLength } : message
  );

const run = async (): Promise<void> => {
  // With a CVL: nothing before the gesture, then the worklet, the CVL, the volume and the tune asked for.
  {
    const { stub, music, gesture } = player();

    await music.init();
    music.play(3);
    await settle();

    expect(
      'before a gesture: no AudioContext is made',
      stub.contexts.length,
      0
    );
    expect('a CVL makes the music available', music.available, true);

    await gesture();

    const [context] = stub.contexts;

    expect('the first gesture makes one context', stub.contexts.length, 1);
    expect(
      'and resumes it, inside the gesture',
      [context.resumes > 0, context.state],
      [true, 'running']
    );
    expect('the worklet module is loaded from its URL', context.modules, [
      'dist/musicWorklet.js?v=test',
    ]);
    expect('the node is connected to the speakers', stub.nodes[0].connected, [
      context.destination,
    ]);
    expect(
      'the worklet is sent the CVL, then the volume, then the tune asked for before the gesture',
      sent(stub),
      [{ load: 5 }, { volume: 0.49 }, { play: { id: 3, level: 3 } }]
    );

    await gesture('keydown');
    await gesture();

    expect('later gestures make no more contexts', stub.contexts.length, 1);

    stub.messages.length = 0;
    music.play(4);
    music.stop();
    music.stop();

    expect(
      'play sends PlayTune; stop is PlayTune 1, the fade, sent once',
      sent(stub),
      [{ play: { id: 4, level: 3 } }, { play: { id: 1, level: 3 } }]
    );

    // Silent after the fade: the context is let go of. While a tune is wanted, it isn't (it may be resting).
    stub.nodes[0].reply({ idle: true });
    await settle();

    expect(
      'idle after a fade suspends the context',
      context.state,
      'suspended'
    );

    music.play(3);
    await settle();

    expect(
      'the next tune resumes it',
      [context.state, sent(stub).pop()],
      ['running', { play: { id: 3, level: 3 } }]
    );

    const suspends = context.suspends;

    stub.nodes[0].reply({ idle: true });

    expect(
      'idle while a tune is wanted leaves it running',
      [context.suspends, context.state],
      [suspends, 'running']
    );
  }

  // The volume: posted at once, and the context suspended while it's off.
  {
    const { stub, music, gesture, gain } = player();

    await music.init();
    await gesture();
    await settle();
    stub.messages.length = 0;

    const [context] = stub.contexts;

    gain.value = 0.25;
    music.volumeChanged();

    expect('a volume change is posted', sent(stub), [{ volume: 0.25 }]);

    gain.value = 0;
    music.volumeChanged();
    await settle();

    expect(
      'off posts 0 and suspends',
      [sent(stub).pop(), context.state],
      [{ volume: 0 }, 'suspended']
    );

    gain.value = 1;
    music.volumeChanged();
    await settle();

    expect(
      'on again with no tune wanted posts it, and leaves the context suspended',
      [sent(stub).pop(), context.state],
      [{ volume: 1 }, 'suspended']
    );

    music.play(3);
    gain.value = 0;
    music.volumeChanged();
    gain.value = 0.5;
    music.volumeChanged();
    await settle();

    expect(
      'on again with a tune wanted resumes',
      [sent(stub).pop(), context.state],
      [{ volume: 0.5 }, 'running']
    );

    // A jingle muted part-way: its moment has passed, so turned up again, the rest isn't heard.
    music.play(24, 3, { once: true });
    gain.value = 0;
    music.volumeChanged();
    gain.value = 0.5;
    music.volumeChanged();
    await settle();

    expect(
      'a jingle muted part-way isn’t picked up again when turned up',
      [sent(stub).pop(), context.state],
      [{ volume: 0.5 }, 'suspended']
    );

    // A jingle while the sound's off: heard, it would have replaced the theme, so the theme isn't picked up again.
    music.play(10);
    gain.value = 0;
    music.volumeChanged();
    music.play(33, 3, { once: true });
    gain.value = 0.5;
    music.volumeChanged();
    await settle();

    expect(
      'a jingle dropped while off retires the theme it would have replaced',
      [sent(stub).pop(), context.state],
      [{ volume: 0.5 }, 'suspended']
    );
  }

  // Turned off while the worklet's module loads: the context started in the gesture is suspended once it has.
  {
    const { stub, music, gesture, gain } = player();

    await music.init();
    music.play(3);
    // The gesture starts the context and the load at once; the volume goes to 0 before the load has finished.
    const started = gesture();

    gain.value = 0;
    music.volumeChanged();
    await started;
    await settle();

    const [context] = stub.contexts;

    expect(
      'off during the load: the volume posted is 0, and the context suspended',
      [sent(stub).find((message) => 'volume' in message), context.state],
      [{ volume: 0 }, 'suspended']
    );
  }

  // A context whose state lags the calls, as a browser's does: the slider through 0 and back, and a tune straight
  //  after the fade's suspend, still end up playing.
  {
    const { stub, music, gesture, gain } = player({ context: { lag: true } });
    const wait = () => new Promise((resolve) => setTimeout(resolve, 40));

    await music.init();
    music.play(3);
    await gesture();
    await wait();

    const [context] = stub.contexts;

    gain.value = 0;
    music.volumeChanged();
    gain.value = 0.04;
    music.volumeChanged();
    await wait();

    expect(
      'the slider through 0 and straight back: running',
      context.state,
      'running'
    );

    music.stop();
    stub.nodes[0].reply({ idle: true });
    music.play(4);
    await wait();

    expect(
      'a tune straight after the fade suspends: running',
      context.state,
      'running'
    );

    gain.value = 0;
    music.volumeChanged();
    await wait();

    expect('and off: suspended', context.state, 'suspended');
  }

  // A first press the browser doesn't count (a touch's pointerdown, Escape): the context waits, and the next press asks
  //  again, until it runs; then presses are let be.
  {
    const { stub, music, gesture } = player({ context: { blocked: true } });

    await music.init();
    music.play(3);
    await gesture('pointerdown');

    const [context] = stub.contexts;

    expect(
      'a press too early: one context, waiting',
      [stub.contexts.length, context.resumes, context.state],
      [1, 1, 'suspended']
    );

    await gesture('pointerup');

    expect('the next press asks again', context.resumes, 2);

    context.allow();
    await settle();
    await gesture('touchend');
    await gesture('keydown');

    expect(
      'once running, presses no longer resume it',
      [context.resumes, context.state, stub.contexts.length],
      [2, 'running', 1]
    );

    music.volumeChanged();
    stub.messages.length = 0;
    music.stop();
    stub.nodes[0].reply({ idle: true });
    await settle();

    expect(
      'and a fade still lets it go: the waiting resume held nothing up',
      context.state,
      'suspended'
    );
  }

  // The same, where the browser refuses that first resume rather than leaving it waiting: the next press asks again.
  {
    const { stub, music, gesture } = player({
      context: { refuseFirst: true },
    });

    await music.init();
    music.play(3);
    await gesture('pointerdown');

    const [context] = stub.contexts;

    expect(
      'a refused first resume: suspended',
      [context.resumes, context.state],
      [1, 'suspended']
    );

    await gesture('pointerup');

    expect(
      'the next press resumes it',
      [context.resumes, context.state],
      [2, 'running']
    );

    music.stop();
    stub.nodes[0].reply({ idle: true });
    await settle();
    await gesture('click');

    expect(
      'once running, a press after a fade leaves it let go of',
      context.state,
      'suspended'
    );
  }

  // No AudioWorklet (a page not served securely): the context made is closed.
  {
    const { stub, music, gesture } = player({ context: { worklet: false } });

    await music.init();
    await gesture();

    expect(
      'without an AudioWorklet the context is closed',
      [stub.contexts[0]?.closed, music.available],
      [true, false]
    );
  }

  // The sound off at the first gesture: nothing is made until it's turned on.
  {
    const { stub, music, gesture, gain } = player({ gain: { value: 0 } });

    await music.init();
    music.play(3);
    await gesture();

    expect('sound off: the gesture makes no context', stub.contexts.length, 0);

    gain.value = 0.49;
    music.volumeChanged();
    await settle();

    expect(
      'turned on: the context is made, and the wanted tune sent',
      [stub.contexts.length, sent(stub).pop()],
      [1, { play: { id: 3, level: 3 } }]
    );
  }

  // No CVL: silent, as before.
  {
    const { stub, music, gesture } = player({ sound: null });

    await music.init();
    music.play(3);
    await gesture();
    music.volumeChanged();
    music.stop();
    await settle();

    expect(
      'no CVL: no context, nothing sent',
      [stub.contexts.length, stub.messages.length, music.available],
      [0, 0, false]
    );
  }

  // A store that can't be read is as no CVL.
  {
    const music = new Music({
      sound: async () => {
        throw new Error('The database is blocked.');
      },
      gain: () => 1,
      workletUrl: 'x',
      gestureTarget: new EventTarget(),
    });

    await music.init();

    expect('an unreadable store: not available', music.available, false);
  }

  // No AudioWorklet, no Web Audio, a context that throws, a module that won't load, a context that won't start: all
  //  silent, and quiet.
  for (const [description, context] of [
    ['no AudioWorklet', { worklet: false }],
    ['no Web Audio', { none: true }],
    ['a context that throws', { throws: true }],
    ['a module that will not load', { moduleFails: true }],
    ['a context that will not start', { resumeFails: true }],
  ] as const) {
    const { stub, music, gesture } = player({ context });

    await music.init();
    music.play(3);
    await gesture();
    await settle();
    music.play(4);
    music.stop();
    music.volumeChanged();
    await settle();

    const loaded = stub.nodes.length > 0;

    expect(
      `${description}: nothing goes wrong`,
      [said.length, unhandled.length],
      [0, 0]
    );

    if (description === 'a context that will not start') {
      expect(`${description}: the tune is still sent`, loaded, true);
    } else {
      expect(
        `${description}: no node, and not available`,
        [loaded, music.available],
        [false, false]
      );
    }
  }

  // The worklet can't read the CVL: as without one.
  {
    const { stub, music, gesture } = player();

    await music.init();
    await gesture();
    await settle();
    stub.nodes[0].reply({ error: 'ASOUND.CVL: not the AdLib driver' });
    await settle();

    expect(
      'a CVL the worklet refuses: not available, and quiet',
      [music.available, stub.contexts[0].state, said.length],
      [false, 'suspended', 0]
    );

    const resumes = stub.contexts[0].resumes,
      before = stub.messages.length;

    music.play(3);
    music.volumeChanged();
    await settle();

    expect(
      'and nothing after starts it again',
      [stub.contexts[0].resumes, stub.messages.length, stub.contexts[0].state],
      [resumes, before, 'suspended']
    );
  }

  // A tune played once (a jingle): not kept for the first gesture; after one, posted as any tune is, and once it has
  //  played out the context is let go of, as after a fade, and a theme after it is held again.
  {
    const { stub, music, gesture } = player();

    await music.init();
    music.play(44, 3, { once: true });
    await gesture();
    await settle();

    expect(
      'a jingle before the first gesture is not played at it',
      sent(stub),
      [{ load: 5 }, { volume: 0.49 }]
    );

    const [context] = stub.contexts;

    stub.messages.length = 0;
    music.play(44, 3, { once: true });
    await settle();

    expect(
      'after it, a jingle is posted, and the context runs',
      [sent(stub), context.state],
      [[{ play: { id: 44, level: 3 } }], 'running']
    );

    stub.nodes[0].reply({ idle: true });
    await settle();

    expect(
      'once it has played out, the context is suspended',
      context.state,
      'suspended'
    );

    stub.messages.length = 0;
    music.stop();

    expect('and there is nothing left to fade', sent(stub), []);

    music.play(10);
    await settle();
    stub.nodes[0].reply({ idle: true });
    await settle();

    expect(
      'a theme after a jingle is held again: idle leaves it running',
      [sent(stub), context.state],
      [[{ play: { id: 10, level: 3 } }], 'running']
    );

    // A jingle over a theme replaces it, as there's one driver: once it has played out, the context is let go of.
    music.play(24, 3, { once: true });
    stub.nodes[0].reply({ idle: true });
    await settle();

    expect(
      'a jingle over a theme lets the context go once it has played',
      context.state,
      'suspended'
    );
  }

  // An idle the worklet sent before it had the latest tune is about the one before: a jingle just after a fade plays.
  //  And a jingle asked for while the sound's off is dropped, not played when it's turned up.
  {
    const { stub, music, gesture, gain } = player();

    await music.init();
    await gesture();
    await settle();

    const [context] = stub.contexts;

    music.play(10);
    music.stop();
    music.play(44, 3, { once: true });
    await settle();
    stub.nodes[0].reply({ idle: true, plays: 2 });
    await settle();

    expect(
      'an idle from before the jingle reached the worklet leaves it playing',
      context.state,
      'running'
    );

    stub.nodes[0].reply({ idle: true, plays: 3 });
    await settle();

    expect('its own idle lets the context go', context.state, 'suspended');

    gain.value = 0;
    music.volumeChanged();
    await settle();
    stub.messages.length = 0;
    music.play(44, 3, { once: true });
    gain.value = 0.49;
    music.volumeChanged();
    await settle();

    expect(
      'a jingle asked for with the sound off is not played when it is turned up',
      sent(stub).filter((message: any) => 'play' in message),
      []
    );
  }

  // The options as a gain: off is 0; the volume squared, as loudness goes.
  expect(
    'soundGain: off, 0, 50, 70, 100, out of range, not a number',
    [
      soundGain(false, 70),
      soundGain(true, 0),
      soundGain(true, 50),
      soundGain(true, 70),
      soundGain(true, 100),
      soundGain(true, 150),
      soundGain(true, '70'),
    ],
    [0, 0, 0.25, 0.48999999999999994, 1, 1, 0]
  );

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL music: ${failures.length} of ${checks} checks\n  ${failures.join(
        '\n  '
      )}\n${said.length ? `  console: ${said.join('\n  ')}\n` : ''}`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS music: ${checks} checks\n`);
};

run().catch((error) => {
  process.stderr.write(
    `FAIL music: ${error instanceof Error ? error.stack : error}\n`
  );
  process.exit(1);
});
