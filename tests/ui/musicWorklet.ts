// The music worklet (packages/audio/musicWorklet.ts) under a stubbed AudioWorkletGlobalScope (#126): it loads the
// player's ASOUND.CVL and plays from it, and a tune the driver can't play (a damaged file, which the driver throws on
// rather than hang) is reported as an error and silenced, with the audio thread still running.
//
// ASOUND.CVL is the player's own copyrighted game data, so it's never in the repository: point CVL at a copy
// (CVL=/path/to/ASOUND.CVL npm run test:music-worklet). Without one the suite skips.

import fs from 'fs';

const cvl = process.env.CVL;

if (!cvl || !fs.existsSync(cvl)) {
  // run-suite.js passes a suite only on a PASS line.
  console.log(
    `PASS musicWorklet SKIP: ${
      cvl ? `${cvl} not found` : 'set CVL to the path of ASOUND.CVL to run it'
    }`
  );
  process.exit(0);
}

const failures: string[] = [];
let checks = 0;

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

const RATE = 48000,
  BLOCK = 128,
  scope = globalThis as any;
let Processor: any = null;

scope.sampleRate = RATE;
scope.currentFrame = 0;
scope.registerProcessor = (_name: string, processor: unknown) => {
  Processor = processor;
};
scope.AudioWorkletProcessor = class {
  readonly replies: unknown[] = [];
  readonly port = {
    onmessage: null as ((event: { data: unknown }) => void) | null,
    postMessage: (message: unknown) => this.replies.push(message),
  };
};

// After the scope's names: the module registers its processor as it loads.
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('@civ-clone/ui-audio/musicWorklet');

const make = () => {
  const processor = new Processor(),
    send = (data: unknown) => processor.port.onmessage({ data }),
    file = fs.readFileSync(cvl),
    load = file.buffer.slice(
      file.byteOffset,
      file.byteOffset + file.byteLength
    );

  send({ load });

  return { processor, send };
};

// `seconds` of output, block by block, as the audio thread asks for it; the loudest sample, and whether it threw.
const render = (processor: any, seconds: number) => {
  let peak = 0,
    threw: unknown = null;

  for (let i = 0; i < (seconds * RATE) / BLOCK; i++) {
    const left = new Float32Array(BLOCK),
      right = new Float32Array(BLOCK);

    try {
      processor.process([], [[left, right]], {});
    } catch (error) {
      threw = error;
    }

    left.forEach((sample) => (peak = Math.max(peak, Math.abs(sample))));
    scope.currentFrame += BLOCK;
  }

  return { peak, threw };
};

expect('the worklet registers its processor', typeof Processor, 'function');

{
  const { processor, send } = make();

  expect('the CVL loads', processor.replies, [{ loaded: true }]);

  send({ volume: 1 });
  send({ play: { id: 3, level: 3 } });

  const { peak, threw } = render(processor, 2);

  expect('the main theme sounds', peak > 0.01, true);
  expect('and nothing throws', threw, null);
}

{
  // The main theme, with its first voice's stream damaged so it reaches no note: patched in the driver's own copy of
  //  the data segment, which it plays from.
  const { processor, send } = make();

  send({ volume: 1 });
  send({ play: { id: 3, level: 3 } });

  const driver = processor.driver,
    voice = driver.voices.find(({ dur }: any) => dur > 0);

  driver.ds[voice.pos] = 0xfd;

  const first = render(processor, 1),
    after = render(processor, 1),
    errors = processor.replies.filter((reply: any) => 'error' in reply);

  expect('a damaged tune is reported once', errors.length, 1);
  expect(
    'as the driver says',
    /reaches no note/.test(errors[0]?.error ?? ''),
    true
  );
  expect(
    'the audio thread carries on',
    [first.threw, after.threw],
    [null, null]
  );
  expect('and is silent after it', after.peak, 0);
  expect('with the driver gone', processor.driver, null);

  // A tune asked for after the failure has no driver to play it.
  send({ play: { id: 4, level: 3 } });

  expect(
    'a tune asked for after it stays silent',
    render(processor, 1).peak,
    0
  );
}

if (failures.length) {
  process.stderr.write(
    `FAIL musicWorklet\n${failures
      .map((failure) => `  ${failure}`)
      .join('\n')}\n`
  );
  process.exit(1);
}

console.log(`PASS musicWorklet (${checks} checks)`);
