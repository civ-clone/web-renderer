// Renders a tune offline: packages/audio/cvl/Driver.ts makes the register
// writes and Opl2 plays them, each write landing on its own frame. Ticks are
// sampleRate / 60 frames apart and the fast worker's five calls a tick
// sampleRate / 300, so a write labelled (tick, sub) lands at
// (5 · tick + sub) / 300 s. tools/asound-cvl/render-ts.mjs writes the result to
// a WAV, to compare with render.py's pyopl renders (#126).

import Driver, { RegisterWrite } from '../cvl/Driver';
import Image from '../cvl/Image';
import Opl2 from './Opl2';

export { Image };

export interface RenderOptions {
  level?: number;
  sampleRate?: number;
}

/** The writes for `seconds` of `id` at `level`, after the driver's reset. */
export const tuneWrites = (
  image: Image,
  id: number,
  seconds: number,
  level = 3
): { reset: RegisterWrite[]; writes: RegisterWrite[] } => {
  const driver = new Driver(image);

  driver.reset();

  const reset = driver.takeWrites(),
    ticks = Math.ceil(seconds * 60);
  let fast = false;

  driver.play(id, level);

  for (let tick = 0; tick < ticks; tick++) {
    // Five 300 Hz interrupts, the fast worker on each while it's requested and
    // the 60 Hz worker on the fifth, after that interrupt's fast worker.
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

  return { reset, writes: driver.takeWrites() };
};

/** Plays timed writes through a fresh Opl2 for `frames` frames. */
export const renderWrites = (
  reset: RegisterWrite[],
  writes: RegisterWrite[],
  frames: number,
  sampleRate: number
): Float32Array => {
  const chip = new Opl2(sampleRate),
    out = new Float32Array(frames);
  let done = 0;

  reset.forEach(({ register, value }) => chip.write(register, value));

  for (const { tick, sub, register, value } of writes) {
    const at = Math.min(
      frames,
      Math.round(((5 * tick + sub) * sampleRate) / 300)
    );

    if (at > done) {
      chip.generate(out, done, at - done);
      done = at;
    }

    chip.write(register, value);
  }

  chip.generate(out, done, frames - done);

  return out;
};

/** `seconds` of `id` at `level`, as samples in -1…1. */
export const render = (
  image: Image,
  id: number,
  seconds: number,
  { level = 3, sampleRate = 44100 }: RenderOptions = {}
): Float32Array => {
  const { reset, writes } = tuneWrites(image, id, seconds, level);

  return renderWrites(
    reset,
    writes,
    Math.round(seconds * sampleRate),
    sampleRate
  );
};

export default render;
