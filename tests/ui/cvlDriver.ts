// The TypeScript AdLib driver (src/js/Audio/cvl/) makes the same OPL2 register
// writes as tools/asound-cvl/sim.py, which matches the original driver under
// emulation (#126): every PlayTune ID 0–44 at every level 0–3, over 2,400
// ticks, labelled with the same tick and sub-tick. sim.py's side is
// tests/ui/fixtures/cvl-driver.json, from tools/asound-cvl/hashes.py, whose
// docstring defines the run and the bytes hashed.
//
// ASOUND.CVL is the player's own copyrighted game data, so it's never in the
// repository: point CVL at a copy (CVL=/path/to/ASOUND.CVL npm run
// test:cvl-driver). Without one the suite skips.

import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

import Driver, { RegisterWrite } from '../../src/js/Audio/cvl/Driver';
import Image from '../../src/js/Audio/cvl/Image';

interface Fixture {
  ticks: number;
  hashes: { [id: string]: { writes: number; sha256: string }[] };
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

// hashes.py's writes(): reset, drop its writes, play, then `ticks` periods of
// five 300 Hz interrupts, the fast worker on each while it's requested and the
// 60 Hz worker on the fifth, after that interrupt's fast worker.
const play = (driver: Driver, id: number, level: number) => {
  driver.play(id, level);

  let fast = false;

  for (let tick = 0; tick < fixture.ticks; tick++) {
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
};

// The writes from play() on, streamed through `onWrite`.
const streamed = (id: number, level: number): RegisterWrite[] => {
  const writes: RegisterWrite[] = [];
  let recording = false;

  const driver = new Driver(image, {
    onWrite: (write) => recording && writes.push(write),
  });

  driver.reset();
  recording = true;
  play(driver, id, level);

  return writes;
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
    const writes = streamed(Number(id), level);

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

{
  // Without a sink, the same writes collect on the driver.
  const driver = new Driver(image);

  driver.reset();
  driver.takeWrites();
  play(driver, 42, 3);

  expect(
    'collected writes are the streamed writes',
    digest(driver.takeWrites()),
    digest(streamed(42, 3))
  );
  expect('takeWrites() empties the collection', driver.writes.length, 0);
}

{
  // Each Driver plays from its own copy of the data segment: ID 44 patches its
  // streams, and the Image keeps the file's bytes.
  const before = createHash('sha256').update(image.ds).digest('hex');

  streamed(44, 3);
  streamed(38, 3);

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
