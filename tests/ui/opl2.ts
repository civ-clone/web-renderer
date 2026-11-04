// The OPL2 synth (src/js/Audio/opl/Opl2.ts) behaves as the chip does where
// Civilization's AdLib music depends on it (#126): pitch follows the chip's
// 49,716 Hz clock at any output rate, a key-on only sounds on a key that was
// off, frequency and level writes leave the phase alone, the envelopes'
// extremes, and the output is the same every run. No game data needed: these
// are synthetic notes. tools/asound-cvl/render-ts.mjs renders real tunes, to
// compare with render.py's pyopl renders.

import { createHash } from 'crypto';

import Opl2, { CHIP_RATE } from '../../src/js/Audio/opl/Opl2';

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

type Write = [register: number, value: number];

interface Patch {
  // Register 20, 40, 60, 80 and E0 values for the modulator and carrier.
  modulator?: [number, number, number, number, number];
  carrier?: [number, number, number, number, number];
  c0?: number;
}

// Channel 0 (operators at offsets 0 and 3), set up but not keyed on. By
// default a plain sine: the modulator never attacks, the carrier at full level with an
// instant attack, sustaining.
const setup = ({
  modulator = [0x21, 0x3f, 0x00, 0x0f, 0],
  carrier = [0x21, 0x00, 0xf0, 0x0f, 0],
  c0 = 0,
}: Patch = {}): Write[] => [
  [0x01, 0x20],
  [0x08, 0x40],
  [0xbd, 0xc0],
  ...[0x20, 0x40, 0x60, 0x80, 0xe0].flatMap((base, i): Write[] => [
    [base, modulator[i]],
    [base + 3, carrier[i]],
  ]),
  [0xc0, c0],
];

const keyOn = (fnum: number, block: number, channel = 0): Write[] => [
  [0xa0 + channel, fnum & 0xff],
  [0xb0 + channel, 0x20 | (block << 2) | (fnum >> 8)],
];

// Renders `seconds`, applying each batch of writes at its time.
const render = (
  timeline: [seconds: number, writes: Write[]][],
  seconds: number,
  sampleRate = 44100
): Float32Array => {
  const chip = new Opl2(sampleRate),
    out = new Float32Array(Math.round(seconds * sampleRate));
  let done = 0;

  timeline.forEach(([time, writes]) => {
    const at = Math.round(time * sampleRate);

    chip.generate(out, done, at - done);
    done = at;
    writes.forEach(([register, value]) => chip.write(register, value));
  });

  chip.generate(out, done, out.length - done);

  return out;
};

const rms = (samples: Float32Array, from: number, to: number) => {
  let sum = 0;

  for (let i = from; i < to; i++) {
    sum += samples[i] ** 2;
  }

  return Math.sqrt(sum / (to - from));
};

const peak = (samples: Float32Array, from: number, to: number) =>
  samples.subarray(from, to).reduce((max, x) => Math.max(max, Math.abs(x)), 0);

const same = (a: Float32Array, b: Float32Array) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

// The frequency from rising zero crossings, interpolated, between `from` and `to`.
const frequency = (
  samples: Float32Array,
  sampleRate: number,
  from: number,
  to: number
) => {
  const crossings: number[] = [];

  for (let i = from + 1; i < to; i++) {
    if (samples[i - 1] < 0 && samples[i] >= 0) {
      crossings.push(i - 1 + samples[i - 1] / (samples[i - 1] - samples[i]));
    }
  }

  return (
    ((crossings.length - 1) * sampleRate) /
    (crossings[crossings.length - 1] - crossings[0])
  );
};

const cents = (actual: number, expected: number) =>
  Math.round(1200 * Math.log2(actual / expected) * 100) / 100;

// Full level: one operator's largest output, doubled, over 32,768.
const FULL = (2041 * 2 * 2) / 32768;

{
  // A sine's pitch is F · 49716 / 2^(20 − block), at any output rate.
  [
    [0x241, 4],
    [0x158, 2],
    [0x2ae, 6],
  ].forEach(([fnum, block]) => {
    const expected = (fnum * CHIP_RATE) / 2 ** (20 - block);

    [44100, 48000].forEach((sampleRate) => {
      const samples = render(
          [[0, [...setup(), ...keyOn(fnum, block)]]],
          1,
          sampleRate
        ),
        actual = frequency(samples, sampleRate, sampleRate / 10, sampleRate);

      checks++;

      if (Math.abs(cents(actual, expected)) > 1) {
        failures.push(
          `F-number ${fnum} block ${block} at ${sampleRate} Hz plays ${actual.toFixed(
            3
          )} Hz, ${cents(actual, expected)} cents from ${expected.toFixed(3)}`
        );
      }
    });
  });
}

// A percussive note: instant attack, a slow decay to silence.
const percussive = setup({ carrier: [0x01, 0x00, 0xf4, 0x04, 0] });

{
  // A key-on while the key is already on changes nothing (legato).
  const plain = render([[0, [...percussive, ...keyOn(0x241, 4)]]], 1),
    again = render(
      [
        [0, [...percussive, ...keyOn(0x241, 4)]],
        [0.5, keyOn(0x241, 4)],
      ],
      1
    );

  expect(
    'a key-on on a sounding note does not retrigger',
    same(plain, again),
    true
  );
}

{
  // A key-off and a key-on in one batch retrigger: the decayed note is back at
  // full level.
  const samples = render(
      [
        [0, [...percussive, ...keyOn(0x241, 4)]],
        [0.5, [[0xb0, 0x10 | 2], ...keyOn(0x241, 4)]],
      ],
      1
    ),
    before = peak(samples, 22050 - 400, 22050),
    after = peak(samples, 22050, 22050 + 400);

  expect('the note had decayed before the retrigger', before < FULL / 2, true);
  expect(
    'off then on in one batch retriggers to full level',
    after > FULL * 0.95,
    true
  );
}

{
  // Rewriting the frequency or the level a note already has changes nothing:
  // neither resets the phase.
  const plain = render([[0, [...setup(), ...keyOn(0x241, 4)]]], 0.5),
    rewritten = render(
      [
        [0, [...setup(), ...keyOn(0x241, 4)]],
        [0.1, [...keyOn(0x241, 4), [0x43, 0x00]]],
        [0.2, [[0xa0, 0x41]]],
      ],
      0.5
    );

  expect(
    'rewriting the frequency and level keeps the phase',
    same(plain, rewritten),
    true
  );

  // A new frequency mid-note, at a peak, carries on from there: a phase reset
  // would drop the output to zero.
  const chip = new Opl2(CHIP_RATE),
    out = new Float32Array(Math.round(CHIP_RATE / 2));
  let at = Math.round(CHIP_RATE / 10);

  [...setup(), ...keyOn(0x241, 4)].forEach(([r, v]) => chip.write(r, v));
  chip.generate(out, 0, at);

  while (Math.abs(out[at - 1]) < FULL * 0.99) {
    chip.generate(out, at, 1);
    at++;
  }

  keyOn(0x2c0, 4).forEach(([r, v]) => chip.write(r, v));
  chip.generate(out, at, out.length - at);

  // The output runs a chip sample behind, so out[at + 1] is the first at the
  // new frequency.
  expect(
    'a frequency change carries on from the same phase',
    Math.abs(out[at + 1]) > FULL * 0.95 &&
      Math.sign(out[at + 1]) === Math.sign(out[at - 1]),
    true
  );
  expect(
    'and plays the new frequency',
    Math.abs(
      cents(
        frequency(out, CHIP_RATE, at + 1000, out.length),
        (0x2c0 * CHIP_RATE) / 2 ** 16
      )
    ) < 1,
    true
  );
}

{
  // Attack rate 15 is at full level from the first cycle; attack rate 4 takes
  // most of a second to get there.
  const fast = render([[0, [...setup(), ...keyOn(0x241, 4)]]], 1),
    slow = render(
      [
        [
          0,
          [
            ...setup({ carrier: [0x21, 0x00, 0x40, 0x0f, 0] }),
            ...keyOn(0x241, 4),
          ],
        ],
      ],
      1
    ),
    cycle = Math.ceil(44100 / 437);

  expect(
    'attack rate 15 reaches full level at once',
    peak(fast, 0, cycle) > FULL * 0.98,
    true
  );
  expect(
    'and holds it',
    Math.abs(peak(fast, 22050, 23000) / FULL - 1) < 0.02,
    true
  );
  expect(
    'attack rate 4 is still rising after a tenth of a second',
    peak(slow, 4410 - cycle, 4410) < FULL / 2,
    true
  );
  expect(
    'and gets there',
    peak(slow, 44100 - 2 * cycle, 44100) > FULL * 0.9,
    true
  );
}

{
  // A percussive envelope falls to silence even with the key held.
  const samples = render(
    [
      [
        0,
        [
          ...setup({ carrier: [0x01, 0x00, 0xf8, 0x25, 0] }),
          ...keyOn(0x241, 4),
        ],
      ],
    ],
    3
  );

  expect(
    'a percussive note starts at full level',
    peak(samples, 0, 200) > FULL * 0.95,
    true
  );
  expect(
    'and decays to silence with the key held',
    peak(samples, samples.length - 4410, samples.length),
    0
  );
  expect(
    'falling all the way',
    rms(samples, 4410, 8820) > rms(samples, 22050, 26460) &&
      rms(samples, 22050, 26460) > rms(samples, 44100, 48510) &&
      rms(samples, 44100, 48510) > 0,
    true
  );
}

{
  // Waveforms other than the sine need register 01's enable bit.
  const halfSine = setup({ carrier: [0x21, 0x00, 0xf0, 0x0f, 1] }),
    sine = render([[0, [...setup(), ...keyOn(0x241, 4)]]], 0.2),
    disabled = render(
      [[0, [...halfSine, [0x01, 0x00], ...keyOn(0x241, 4)]]],
      0.2
    ),
    enabled = render([[0, [...halfSine, ...keyOn(0x241, 4)]]], 0.2);

  expect(
    'without the enable bit every waveform is a sine',
    same(sine, disabled),
    true
  );
  expect('with it the half sine has no negative half', Math.min(...enabled), 0);
}

{
  // The same writes make the same samples, every run: FM with feedback,
  // tremolo, vibrato, key scaling, every waveform, additive, three channels and
  // a pitch slide, at 44.1 kHz.
  const timeline: [number, Write[]][] = [
      [
        0,
        [
          ...setup({
            modulator: [0xe1, 0x52, 0xf3, 0x25, 2],
            carrier: [0x41, 0x00, 0xa4, 0x37, 0],
            c0: 0x0c,
          }),
          [0x21, 0x32],
          [0x41, 0x18],
          [0x61, 0x73],
          [0x81, 0x15],
          [0xe1, 3],
          [0x24, 0xa1],
          [0x44, 0x00],
          [0x64, 0x52],
          [0x84, 0x16],
          [0xe4, 1],
          [0xc1, 0x0f],
          [0x22, 0x02],
          [0x25, 0x01],
          [0x42, 0x20],
          [0x45, 0x00],
          [0x62, 0xf6],
          [0x65, 0xf6],
          [0x82, 0x22],
          [0x85, 0x22],
          [0xe5, 2],
          [0xc2, 0x05],
          ...keyOn(0x241, 4),
          ...keyOn(0x158, 3, 1),
          ...keyOn(0x2ae, 5, 2),
        ],
      ],
      ...Array.from({ length: 30 }, (_, i): [number, Write[]] => [
        0.3 + i / 60,
        keyOn(0x241 + i * 4, 4),
      ]),
      [0.9, [[0xb1, 0x0d]]],
      [1.0, keyOn(0x158, 3, 1)],
    ],
    hash = (samples: Float32Array) =>
      createHash('sha256')
        .update(
          Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength)
        )
        .digest('hex'),
    first = hash(render(timeline, 1.5));

  expect('a render is the same twice', hash(render(timeline, 1.5)), first);
  expect(
    'and the same as it was',
    first,
    '27ae649cfaacd1a165980ac39dda3b09da59794e9ea2ee3f575f94f7c5e188a2'
  );
}

if (failures.length) {
  process.stderr.write(
    `FAIL opl2\n${failures.map((failure) => `  ${failure}`).join('\n')}\n`
  );
  process.exit(1);
}

console.log(`PASS opl2 (${checks} checks)`);
