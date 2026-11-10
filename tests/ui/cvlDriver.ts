// The TypeScript AdLib driver (packages/audio/cvl/) makes the same OPL2 register
// writes as tools/asound-cvl/sim.py, which matches the original driver under
// emulation (#126): every PlayTune ID 0–44 at every level 0–3, over 2,400
// ticks, labelled with the same tick and sub-tick, and PlayTune calls on a
// driver already playing. sim.py's side is
// tests/ui/fixtures/cvl-driver.json, from tools/asound-cvl/hashes.py, whose
// docstring defines the run and the bytes hashed.
//
// ASOUND.CVL is the player's own copyrighted game data, so it's never in the
// repository: point CVL at a copy (CVL=/path/to/ASOUND.CVL npm run
// test:cvl-driver). Without one the suite skips.

import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

import Driver, { RegisterWrite } from '@civ-clone/ui-audio/cvl/Driver';
import Image from '@civ-clone/ui-audio/cvl/Image';

interface Scenario {
  ticks: number;
  // [tick, id, level]: PlayTune calls, each at the start of that tick's period.
  calls: [number, number, number][];
  writes: number;
  sha256: string;
  // What each call returned, and soundTimer() before each and after the last period.
  returns: number[];
  timers: number[];
}

interface Fixture {
  ticks: number;
  hashes: { [id: string]: { writes: number; sha256: string }[] };
  scenarios: Scenario[];
}

const cvl = process.env.CVL;

if (!cvl || !fs.existsSync(cvl)) {
  // run-suite.js passes a suite only on a PASS line.
  console.log(
    `PASS cvlDriver SKIP: ${
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

const fixture: Fixture = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), 'tests', 'ui', 'fixtures', 'cvl-driver.json'),
      'utf8'
    )
  ),
  image = new Image(fs.readFileSync(cvl));

// hashes.py's scenario(): `calls` made at the start of their tick's period, then that period's five 300 Hz
// interrupts, the fast worker on each while it's requested and the 60 Hz worker on the fifth, after that interrupt's
// fast worker. What each call returned, and the timer before each call and after the last period.
const run = (
  driver: Driver,
  calls: [number, number, number][],
  ticks: number
): { returns: number[]; timers: number[] } => {
  const returns: number[] = [],
    timers: number[] = [];
  let fast = false;

  for (let tick = 0; tick < ticks; tick++) {
    calls
      .filter(([at]) => at === tick)
      .forEach(([, id, level]) => {
        timers.push(driver.soundTimer());
        returns.push(driver.play(id, level));
      });

    for (let k = 0; k < 5; k++) {
      if (fast) {
        driver.fastWorker();
      }

      if (k === 4) {
        const r = driver.soundWorker();

        if (r === 1) {
          fast = true;
        } else if (r === 0xffff) {
          fast = false;
        }
      }
    }
  }

  timers.push(driver.soundTimer());

  return { returns, timers };
};

// hashes.py's writes(): one tune from a silent driver.
const play = (driver: Driver, id: number, level: number) =>
  run(driver, [[0, id, level]], fixture.ticks);

// The writes from the first call on, streamed through `onWrite`.
const streamed = (
  calls: [number, number, number][],
  ticks: number = fixture.ticks
): { writes: RegisterWrite[]; returns: number[]; timers: number[] } => {
  const writes: RegisterWrite[] = [];
  let recording = false;

  const driver = new Driver(image, {
    onWrite: (write) => recording && writes.push(write),
  });

  driver.reset();
  recording = true;

  return { writes, ...run(driver, calls, ticks) };
};

// Each write as 7 bytes: tick u32 LE, sub u8, register u8, value u8.
const digest = (writes: RegisterWrite[]): string => {
  const bytes = Buffer.alloc(writes.length * 7);

  writes.forEach(({ tick, sub, register, value }, i) => {
    bytes.writeUInt32LE(tick, i * 7);
    bytes.writeUInt8(sub, i * 7 + 4);
    bytes.writeUInt8(register, i * 7 + 5);
    bytes.writeUInt8(value, i * 7 + 6);
  });

  return createHash('sha256').update(bytes).digest('hex');
};

let subTickWrites = 0;

for (const [id, levels] of Object.entries(fixture.hashes)) {
  levels.forEach((expected, level) => {
    const { writes } = streamed([[0, Number(id), level]]);

    subTickWrites += writes.filter(({ sub }) => sub > 0).length;

    expect(
      `ID ${id} at level ${level} makes the same writes as sim.py`,
      { writes: writes.length, sha256: digest(writes) },
      expected
    );
  });
}

expect(
  'every ID and level is checked',
  Object.values(fixture.hashes).map((levels) => levels.length),
  Array.from({ length: 45 }, () => 4)
);
expect('the fast worker writes between ticks', subTickWrites > 0, true);

// PlayTune on a driver that's already playing: the fade (1), the query (2), a reset (0) and the war drums (33) over a
//  tune, and a tune started over a fade, with what each returned and the timer each restarted.
fixture.scenarios.forEach(({ ticks, calls, ...expected }) => {
  const { writes, returns, timers } = streamed(calls, ticks);

  expect(
    `${JSON.stringify(calls)} over ${ticks} ticks matches sim.py`,
    { writes: writes.length, sha256: digest(writes), returns, timers },
    expected
  );
});

expect(
  'a scenario queries a tune still playing',
  fixture.scenarios.some(({ calls, returns }) =>
    calls.some(([, id], index) => id === 2 && returns[index] !== 0)
  ),
  true
);

{
  // A damaged tune that reaches no note (restarting where it starts, here) throws rather than hanging. Patched in
  //  the driver's own copy of the data segment, which it plays from.
  const driver = new Driver(image);

  driver.play(3);

  const voice = (driver as any).voices.find(({ dur }: any) => dur > 0);

  (driver as any).ds[voice.pos] = 0xfd;

  let thrown: unknown = null;

  try {
    for (let tick = 0; tick < 60; tick++) {
      driver.soundWorker();
    }
  } catch (error) {
    thrown = error;
  }

  expect(
    'a stream with no note throws',
    thrown instanceof RangeError && /reaches no note/.test(thrown.message),
    true
  );
}

{
  // Without a sink, the same writes collect on the driver.
  const driver = new Driver(image);

  driver.reset();
  driver.takeWrites();
  play(driver, 42, 3);

  expect(
    'collected writes are the streamed writes',
    digest(driver.takeWrites()),
    digest(streamed([[0, 42, 3]]).writes)
  );
  expect('takeWrites() empties the collection', driver.writes.length, 0);
}

{
  // Each Driver plays from its own copy of the data segment: ID 44 patches its
  // streams, and the Image keeps the file's bytes.
  const before = createHash('sha256').update(image.ds).digest('hex');

  streamed([[0, 44, 3]]);
  streamed([[0, 38, 3]]);

  expect(
    "playing leaves the Image's data segment as it was",
    createHash('sha256').update(image.ds).digest('hex'),
    before
  );
}

if (failures.length) {
  process.stderr.write(
    `FAIL cvlDriver\n${failures.map((failure) => `  ${failure}`).join('\n')}\n`
  );
  process.exit(1);
}

console.log(`PASS cvlDriver (${checks} checks)`);
