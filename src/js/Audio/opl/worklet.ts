// The OPL2 synth as an AudioWorkletProcessor, registered as 'opl2' (#126). The
// main thread runs src/js/Audio/cvl/Driver.ts and posts its writes here in
// batches, each write stamped with the AudioContext time it should land at:
//
//   node.port.postMessage({ writes: [{ time, register, value }, …] });
//   node.port.postMessage({ reset: true }); // drops pending writes, silences the chip
//
// A write lands on the frame round(time · sampleRate), in the order it was
// posted, and one whose time has passed lands at the start of the next block.
// Ticks are sampleRate / 60 frames apart and the fast worker's writes
// sampleRate / 300, so stamp a write (tick, sub) at start + (5 · tick + sub) / 300.
//
// It runs in the AudioWorkletGlobalScope, so it uses no DOM and imports only
// Opl2. Building it: the worklet has to be its own file for
// `audioContext.audioWorklet.addModule()`. Adding this file to esbuild.js's
// `entryPoints` emits dist/worklet.js beside frontend.js (entryNames is
// '[name]'), bundled with Opl2 and nothing else; PR 2's player does that and
// loads it.

import Opl2 from './Opl2';

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

export interface OplMessage {
  writes?: TimedWrite[];
  reset?: boolean;
}

class OplProcessor extends AudioWorkletProcessor {
  private chip = new Opl2(sampleRate);
  // Pending writes, in landing order: frame, register, value.
  private queue: [number, number, number][] = [];
  private next = 0;

  constructor() {
    super();
    this.port.onmessage = ({ data }: MessageEvent<OplMessage>) => {
      if (data.reset) {
        this.chip = new Opl2(sampleRate);
        this.queue = [];
        this.next = 0;
      }

      if (!data.writes || data.writes.length === 0) {
        return;
      }

      const pending = this.queue.slice(this.next),
        last = pending.length ? pending[pending.length - 1][0] : -Infinity;

      data.writes.forEach(({ time, register, value }) =>
        pending.push([Math.round(time * sampleRate), register, value])
      );

      // Batches normally arrive in time order; if one doesn't, sort, keeping
      // the posted order of writes on the same frame.
      if (Math.round(data.writes[0].time * sampleRate) < last) {
        pending.sort((a, b) => a[0] - b[0]);
      }

      this.queue = pending;
      this.next = 0;
    };
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

    while (this.next < this.queue.length) {
      const [frame, register, value] = this.queue[this.next],
        at = Math.max(0, frame - start);

      if (at >= frames) {
        break;
      }

      if (at > done) {
        this.chip.generate(out, done, at - done);
        done = at;
      }

      this.chip.write(register, value);
      this.next++;
    }

    this.chip.generate(out, done, frames - done);

    if (this.next > 1024) {
      this.queue = this.queue.slice(this.next);
      this.next = 0;
    }

    for (let i = 1; i < channels.length; i++) {
      channels[i].set(out);
    }

    return true;
  }
}

registerProcessor('opl2', OplProcessor);
