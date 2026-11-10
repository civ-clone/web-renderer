// Civilization's AdLib music as an AudioWorkletProcessor, registered as 'opl2' (#126): the player's ASOUND.CVL driver
// (packages/audio/cvl/Driver.ts) and the OPL2 synth (packages/audio/opl/Opl2.ts) side by side, so the driver's 60 Hz and
// 300 Hz interrupts fall on exact frames of the output, with no main-thread timer to jitter them. packages/audio/Music.ts
// loads it and talks to it:
//
//   node.port.postMessage({ load: cvlBytes });        // an ArrayBuffer of ASOUND.CVL: a fresh driver and chip
//   node.port.postMessage({ play: { id, level } });   // PlayTune: 1 fades out, 3 is the main theme…
//   node.port.postMessage({ volume: 0.5 });           // output gain, 0–1, ramped over 20 ms
//
// and it answers `{ loaded: true }`, `{ error: message }` for a file it can't play, and `{ idle: true }` once the output
// has been silent for two seconds, for Music to suspend the context after a fade.
//
// Timing: interrupt n lands on frame round(n · sampleRate / 300) after the load. Each runs the fast worker while it is
// requested, and every fifth the 60 Hz worker after it: the order `render.ts` renders in, so each write lands at its
// label's time, (5 · tick + sub) / 300 s. A `play` lands at the start of the next block.
//
// Timed register writes, for a source other than the driver (#801's own scores), are still taken:
//
//   node.port.postMessage({ writes: [{ time, register, value }, …] }); // AudioContext time, in seconds
//   node.port.postMessage({ reset: true }); // drops pending writes and the driver, silences the chip
//
// It runs in the AudioWorkletGlobalScope, so it uses no DOM. esbuild.js builds it as its own file, dist/musicWorklet.js,
// for `audioContext.audioWorklet.addModule()`.

import Driver from './cvl/Driver';
import Image from './cvl/Image';
import Opl2 from './opl/Opl2';

// The AudioWorkletGlobalScope's own names, which lib.dom doesn't declare.
declare const sampleRate: number;
declare const currentFrame: number;
declare function registerProcessor(
  name: string,
  processor: new () => AudioWorkletProcessor
): void;
declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  abstract process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean;
}

export interface TimedWrite {
  /** AudioContext time, in seconds. */
  time: number;
  register: number;
  value: number;
}

export interface MusicMessage {
  load?: ArrayBuffer;
  play?: { id: number; level: number };
  volume?: number;
  writes?: TimedWrite[];
  reset?: boolean;
}

export interface MusicReply {
  loaded?: boolean;
  error?: string;
  idle?: boolean;
  /** With `idle`: how many tunes had been asked for, so a reply that crossed a newer one can be told apart. */
  plays?: number;
}

// Below this, a block counts as silence.
const SILENCE = 1e-4;

class MusicProcessor extends AudioWorkletProcessor {
  private chip = new Opl2(sampleRate);
  private driver: Driver | null = null;
  // Interrupts since the load, the frame the first fell on (set by the first block after it), and whether the fast
  //  worker is running.
  private irq = 0;
  private irqStart: number | null = null;
  private fast = false;
  // Pending timed writes, in landing order: frame, register, value.
  private queue: [number, number, number][] = [];
  private next = 0;
  private gain = 1;
  private targetGain = 1;
  private silentFrames = 0;
  private idle = false;
  private plays = 0;

  constructor() {
    super();
    this.port.onmessage = ({ data }: MessageEvent<MusicMessage>) =>
      this.receive(data);
  }

  private reply(message: MusicReply): void {
    this.port.postMessage(message);
  }

  private receive(data: MusicMessage): void {
    if (data.reset) {
      this.chip = new Opl2(sampleRate);
      this.driver = null;
      this.queue = [];
      this.next = 0;
    }

    if (data.load) {
      try {
        const image = new Image(data.load),
          chip = new Opl2(sampleRate),
          driver = new Driver(image, {
            onWrite: ({ register, value }) => chip.write(register, value),
          });

        driver.reset();
        this.chip = chip;
        this.driver = driver;
        this.irq = 0;
        this.irqStart = null;
        this.fast = false;
        this.reply({ loaded: true });
      } catch (error) {
        this.fail(error);
      }
    }

    if (typeof data.volume === 'number') {
      this.targetGain = Math.min(1, Math.max(0, data.volume));
      // Watched for silence again: a context resumed for the change is let go of once it's quiet.
      this.silentFrames = 0;
      this.idle = false;
    }

    if (data.play) {
      this.plays++;
    }

    if (data.play && this.driver) {
      try {
        this.driver.play(data.play.id, data.play.level);
      } catch (error) {
        this.fail(error);
      }

      this.silentFrames = 0;
      this.idle = false;
    }

    if (data.writes && data.writes.length > 0) {
      this.queueWrites(data.writes);
    }
  }

  private queueWrites(writes: TimedWrite[]): void {
    const pending = this.queue.slice(this.next),
      last = pending.length ? pending[pending.length - 1][0] : -Infinity;

    writes.forEach(({ time, register, value }) =>
      pending.push([Math.round(time * sampleRate), register, value])
    );

    // Batches normally arrive in time order; if one doesn't, sort, keeping the posted order of writes on the same frame.
    if (Math.round(writes[0].time * sampleRate) < last) {
      pending.sort((a, b) => a[0] - b[0]);
    }

    this.queue = pending;
    this.next = 0;
  }

  private nextIrqFrame(): number {
    return this.irqStart! + Math.round((this.irq * sampleRate) / 300);
  }

  // A file the driver can't play (a damaged tune, which throws rather than hang the audio thread): the driver goes
  //  and the chip with it, so nothing more sounds, and Music is told, as for a file that wouldn't load.
  private fail(error: unknown): void {
    this.chip = new Opl2(sampleRate);
    this.driver = null;
    this.fast = false;
    this.reply({
      error: error instanceof Error ? error.message : String(error),
    });
  }

  /** One 300 Hz interrupt: the fast worker while it's requested, and on every fifth the 60 Hz worker after it. */
  private interrupt(): void {
    const driver = this.driver!;

    try {
      if (this.fast) {
        driver.fastWorker();
      }

      if (this.irq % 5 === 0) {
        const r = driver.soundWorker();

        if (r === 1) {
          this.fast = true;
        } else if (r === 0xffff) {
          this.fast = false;
        }
      }
    } catch (error) {
      this.fail(error);
    }

    this.irq++;
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const channels = outputs[0];

    if (!channels || channels.length === 0) {
      return true;
    }

    const out = channels[0],
      frames = out.length,
      start = currentFrame;
    let done = 0;

    if (this.driver && this.irqStart === null) {
      this.irqStart = start;
    }

    for (;;) {
      const irqAt = this.driver ? this.nextIrqFrame() - start : Infinity,
        writeAt =
          this.next < this.queue.length
            ? this.queue[this.next][0] - start
            : Infinity,
        at = Math.max(done, Math.min(irqAt, writeAt));

      if (at >= frames) {
        break;
      }

      if (at > done) {
        this.chip.generate(out, done, at - done);
        done = at;
      }

      if (writeAt <= irqAt) {
        const [, register, value] = this.queue[this.next++];

        this.chip.write(register, value);
      } else {
        this.interrupt();
      }
    }

    this.chip.generate(out, done, frames - done);

    if (this.next > 1024) {
      this.queue = this.queue.slice(this.next);
      this.next = 0;
    }

    this.applyGain(out);

    for (let i = 1; i < channels.length; i++) {
      channels[i].set(out);
    }

    return true;
  }

  // The volume, ramped so a change doesn't click, and the silence watch, from the chip's own level.
  private applyGain(out: Float32Array): void {
    const step = 1 / (0.02 * sampleRate);
    let peak = 0;

    for (let i = 0; i < out.length; i++) {
      const sample = out[i];

      peak = Math.max(peak, Math.abs(sample));

      if (this.gain !== this.targetGain) {
        this.gain =
          this.gain < this.targetGain
            ? Math.min(this.targetGain, this.gain + step)
            : Math.max(this.targetGain, this.gain - step);
      }

      out[i] = sample * this.gain;
    }

    if (peak >= SILENCE) {
      this.silentFrames = 0;
      this.idle = false;

      return;
    }

    this.silentFrames += out.length;

    if (!this.idle && this.silentFrames >= 2 * sampleRate) {
      this.idle = true;
      this.reply({ idle: true, plays: this.plays });
    }
  }
}

registerProcessor('opl2', MusicProcessor);
