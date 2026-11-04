// Civilization's (1991) AdLib sound driver, ASOUND.CVL, as a TypeScript port of
// tools/asound-cvl/sim.py. It makes the OPL2 register writes the original 8086
// code makes, tick for tick (tests/ui/cvlDriver.ts checks every ID and level
// against sim.py), and produces no sound itself: a synth plays the writes.
//
// Addresses in comments are offsets in the CVL's code segment (cs:, image +
// 0x000) and data segment (ds:, image + 0x1e20); docs/asound-cvl-format.md
// describes them.
//
// Timing: call `soundWorker()` at 60 Hz, and `fastWorker()` on each of the five
// 300 Hz interrupts of a tick while `soundWorker()` last returned 1 (until it
// returns 0xffff); on the fifth, the fast worker runs before `soundWorker()`.
// Each write is labelled with the tick it belongs to and a `sub`: 0 for writes
// from `soundWorker()` (and from `play()`/`reset()`, labelled with the last
// tick), and 1, 2, … for the fast worker's writes after that tick's
// `soundWorker()`, one per call. A write's time is (5 × tick + sub) / 300 s
// after the first tick, and writes come out in (tick, sub) order.

import Image, { PATCH_SIZE, PATCH_TABLE } from './Image';
import TUNES, { Arrangement } from './tunes';

export interface RegisterWrite {
  tick: number;
  sub: number;
  register: number;
  value: number;
}

export type WriteSink = (write: RegisterWrite) => void;

export interface DriverOptions {
  /** Receives each write as it's made. Without one, writes collect in `writes`. */
  onWrite?: WriteSink;
}

const FADE_STREAM = 0x5eaa;
const ID33_STREAMS = [0x208, 0x27e, 0x50, 0x98, 0xf2, 0x138, 0x1a4]; // cs:0x1539 table

const s8 = (value: number): number => ((value & 0xff) ^ 0x80) - 0x80;

class Voice {
  dur = 0;
  slide = 0;
  fadeDelta = 0;
  panDelta = 0;
  note = 0;
  instr = 0;
  vol = 0;
  release = 0;
  gate = 0;
  fadeCtr = 0;
  fadePeriod = 0;
  pansCtr = 0;
  pansPeriod = 0;
  pan = 0;
  start = 0;
  pos = 0;
  loop1 = 0;
  loop2 = 0;
  loop1Ctr = 0;
  loop2Ctr = 0;
  restart = 0;
  detune = 0;
  volofs = 0;
}

/** Pitch-sweep (noise) parameters from a patch: count, mask, value, increment. */
type Sweep = readonly [number, number, number, number];

export class Driver {
  /** Writes made so far, when there's no `onWrite`. */
  readonly writes: RegisterWrite[] = [];

  private readonly image: Image;
  private readonly ds: Uint8Array; // patched by IDs 38, 39, 44 and the random command
  private readonly onWrite: WriteSink | undefined;
  private readonly shadow = new Uint8Array(256); // ds:0x7536
  private readonly voices = Array.from({ length: 9 }, () => new Voice());
  private rng: number; // ds:0x73fd
  private lock = 0; // ds:0x741a
  private paused = 0; // ds:0x73ec
  private readonly savedDur = [0, 0, 0, 0, 0, 0, 0, 0]; // ds:0x73ed..0x73f4
  private id33Index: number; // ds:0x73f5
  private sweepSlot = 0; // ds:0x7533
  private readonly slotVoice = [0, 0]; // ds:0x7534 / 0x7535
  private readonly slotCount = [0, 0]; // ds:0x74ee / 0x750e
  private readonly slotMask = [0, 0]; // ds:0x752e / 0x7530
  private readonly slotValue = [0, 0]; // ds:0x7412 / 0x7414
  private readonly slotInc = [0, 0]; // ds:0x7416 / 0x7418
  private readonly sweep: Sweep[] = Array.from(
    { length: 9 },
    () => [0, 0, 0, 0] as const
  ); // ds:0x7636, 8 bytes per voice
  private fastState = 0; // ds:0x73f7
  private ret = 0; // ds:0x73ea (SoundWorker return value)
  private timer = 0; // cs:0x0e0c (SoundTimer)
  private readonly gAm: number;
  private readonly gVib: number;
  private readonly gCsm: number;
  private readonly rhythm = 0; // ds:0x75f3 (never written; BSS)
  private volflag = 1; // uninitialised local [bp-4] of cs:0x07f4, see tickVoice
  private ticks = 0; // soundWorker() calls so far
  private tick = 0; // label of the current write
  private sub = 0;

  constructor(image: Image, { onWrite }: DriverOptions = {}) {
    this.image = image;
    this.onWrite = onWrite;
    this.ds = new Uint8Array(Math.max(0x10000, image.ds.length)); // BSS zeroed
    this.ds.set(image.ds);
    this.rng = image.rngSeed;
    this.id33Index = image.word(0x73f5);
    this.gAm = image.byte(0x73c0);
    this.gVib = image.byte(0x73c2);
    this.gCsm = image.byte(0x73c4);
  }

  /** The writes collected so far, emptying `writes`. */
  takeWrites(): RegisterWrite[] {
    return this.writes.splice(0);
  }

  // ---- low level ---------------------------------------------------------

  private rand(): number {
    const x = (this.rng + 0x9248) & 0xffff;

    this.rng = ((x >> 3) | (x << 13)) & 0xffff;

    return this.rng;
  }

  private write(register: number, value: number): void {
    // cs:0x10db
    register &= 0xff;
    value &= 0xff;
    this.shadow[register] = value;

    const write = { tick: this.tick, sub: this.sub, register, value };

    if (this.onWrite) {
      this.onWrite(write);
    } else {
      this.writes.push(write);
    }
  }

  private carrierReg(v: number): number {
    return 0x40 + this.image.opReg[this.image.voiceOps[v][1]];
  }

  private updateVolume(v: number): void {
    // cs:0x0048
    const V = this.voices[v],
      reg = this.carrierReg(v),
      ksl = this.shadow[reg] & 0xc0,
      a = Math.max(0, Math.min(0x3f, V.vol + s8(V.volofs)));

    this.write(reg, (0x3f - a) | ksl);
  }

  private setFreq(v: number): void {
    // cs:0x017c
    const V = this.voices[v],
      n = V.note,
      f = (this.image.fnum[n % 12] + s8(V.detune)) & 0xffff;

    this.write(0xa0 + v, f & 0xff);

    const keyOn = this.shadow[0xb0 + v] & 0x20;

    this.write(0xb0 + v, keyOn | (Math.floor(n / 12) << 2) | (f >> 8));
  }

  private pitchSlide(v: number): void {
    // cs:0x0230
    const V = this.voices[v],
      w =
        (((this.shadow[0xb0 + v] & 0x1f) << 8) +
          this.shadow[0xa0 + v] +
          s8(V.slide)) &
        0xffff;

    this.write(0xa0 + v, w & 0xff);
    this.write(0xb0 + v, (this.shadow[0xb0 + v] & 0x20) | (w >> 8));
  }

  private keyOff(v: number): void {
    // cs:0x02be
    this.write(0xb0 + v, this.shadow[0xb0 + v] & 0xdf);
  }

  private requestFast(): void {
    // cs:0x1262
    if (this.fastState !== 1) {
      this.fastState = 1;
      this.ret = 1;
    }
  }

  private keyOn(v: number): void {
    // cs:0x02ec
    this.updateVolume(v);

    const sweep = this.sweep[v];

    if (sweep[0] === 0) {
      this.setFreq(v);
      this.write(0xb0 + v, this.shadow[0xb0 + v] | 0x20);

      return;
    }

    // noise / pitch-sweep instrument: frequency is driven by the fast worker instead
    if (v === this.slotVoice[0]) {
      this.sweepSlot = 0;
    }

    if (v === this.slotVoice[1]) {
      this.sweepSlot = 1;
    }

    const s = this.sweepSlot;

    this.sweepSlot ^= 1;

    // Original bug: both paths test slot A's counter (ds:0x74ee), so taking slot B while slot A
    // is busy keys off whatever voice slot B last held (voice 0 before first use).
    if (this.slotCount[0]) {
      const ov = this.slotVoice[s];

      this.write(0xb0 + ov, this.shadow[0xb0 + ov] & 0xdf);
    }

    this.slotVoice[s] = v;
    [this.slotCount[s], this.slotMask[s], this.slotValue[s], this.slotInc[s]] =
      sweep;
    this.requestFast();
  }

  private writeOp(v: number, opReg: number, p: Uint8Array): void {
    // cs:0x04b4
    this.write(0x40 + opReg, 0x3f);
    this.write(
      0xbd,
      (this.rhythm & 0x3f) | (this.gAm ? 0x80 : 0) | (this.gVib ? 0x40 : 0)
    );
    this.write(0x08, this.gCsm ? 0x40 : 0);
    this.write(0xc0 + v, (p[0xa] << 1) | (p[0xd] ? 0 : 1));
    this.write(0x60 + opReg, (p[0] << 4) | (p[1] & 0xf));
    this.write(0x80 + opReg, (p[2] << 4) | (p[3] & 0xf));
    this.write(
      0x20 + opReg,
      (p[0xb] ? 0x80 : 0) +
        (p[0xc] ? 0x40 : 0) +
        (p[4] ? 0x20 : 0) +
        (p[5] ? 0x10 : 0) +
        (p[9] & 0xf)
    );
    this.write(0xe0 + opReg, p[8] & 3);
    this.write(0x40 + opReg, (0x3f - (p[6] & 0x3f)) | (p[7] << 6));
  }

  private loadPatch(v: number, n: number): void {
    // cs:0x06c8
    this.write(0xb0 + v, this.shadow[0xb0 + v] & 0xdf);

    const base = PATCH_TABLE + n * PATCH_SIZE,
      p1 = this.ds.subarray(base, base + 0x16),
      p2 = this.ds.subarray(base + 0x16, base + 0x2c),
      [m, c] = this.image.voiceOps[v],
      word = (offset: number) => p1[offset] | (p1[offset + 1] << 8);

    this.writeOp(v, this.image.opReg[m], p1);
    this.sweep[v] = [p1[0xe], word(0x10), word(0x12), word(0x14)];
    this.writeOp(v, this.image.opReg[c], p2);
  }

  // ---- the per-voice tick, cs:0x07f4 -------------------------------------

  private tickVoice(v: number): void {
    const V = this.voices[v],
      ds = this.ds;

    if (V.dur === 0) {
      return;
    }

    if (V.gate) {
      V.gate = (V.gate - 1) & 0xff;

      if (V.gate === 0) {
        this.keyOff(v);
      }
    }

    V.dur = (V.dur - 1) & 0xff;

    // `volflag` is an uninitialised stack local in the original ([bp-4] in cs:0x07f4). It is
    // cleared whenever a command byte is read and set by the volume/pan commands, so it only
    // survives to the note when the volume command is the last command before it. For a note
    // with no command in front, the original reads whatever the previous voice tick left there;
    // the same frame is reused, so it lives on the instance.
    if (V.dur === 0) {
      for (;;) {
        const pos = V.pos,
          b = ds[pos];

        if (b < 0xf3) {
          break;
        }

        this.volflag = 0;

        if (b === 0xff) {
          // loop level 1
          if (V.loop1Ctr === 0) {
            const n = s8(ds[pos + 1]);

            if (n === 0) {
              V.pos += 2;
              V.loop1 = V.pos;
              V.loop1Ctr = 0;
            } else {
              // 0x80..0xff: 32768+ repeats, i.e. loops until stopped
              V.loop1Ctr = n & 0xffff;
              V.pos = V.loop1;
            }
          } else {
            V.loop1Ctr = (V.loop1Ctr - 1) & 0xffff;

            if (V.loop1Ctr === 0) {
              V.pos += 2;
              V.loop1 = V.pos;
            } else {
              V.pos = V.loop1;
            }
          }
        } else if (b === 0xfe) {
          // loop level 2
          if (V.loop2Ctr === 0) {
            const n = s8(ds[pos + 1]);

            if (n === 0) {
              V.pos += 2;
              V.loop2 = V.pos;
              V.loop1 = V.pos;
              V.loop1Ctr = 0;
              V.loop2Ctr = 0;
            } else {
              V.loop2Ctr = n & 0xffff;
              V.pos = V.loop2;
              V.loop1 = V.loop2;
            }
          } else {
            V.loop2Ctr = (V.loop2Ctr - 1) & 0xffff;

            if (V.loop2Ctr === 0) {
              V.pos += 2;
              V.loop2 = V.pos;
              V.loop1 = V.pos;
            } else {
              V.pos = V.loop2;
              V.loop1 = V.loop2;
            }
          }
        } else if (b === 0xfd) {
          // restart from the top
          V.pos = V.loop1 = V.loop2 = V.restart;
          V.slide = V.fadeDelta = V.panDelta = V.vol = V.release = 0;
          V.fadeCtr = V.pansCtr = 0;
          V.loop1Ctr = V.loop2Ctr = 0;
          V.detune = V.volofs = 0;
          V.pan = 0x40;
        } else if (b === 0xfc) {
          // instrument
          V.instr = ds[pos + 1];
          V.pos += 2;
          this.loadPatch(v, V.instr);
        } else if (b === 0xfb) {
          // ticks of key-off before the next note
          V.release = ds[pos + 1];
          V.pos += 2;
        } else if (b === 0xfa) {
          // per-tick pitch slide
          V.slide = ds[pos + 1];
          V.pos += 2;
        } else if (b === 0xf9) {
          // volume 0..127
          V.vol = (s8(ds[pos + 1]) >> 1) & 0xff;
          V.pos += 2;
          this.volflag = 1;
        } else if (b === 0xf8) {
          // fade: period, signed delta
          V.fadePeriod = ds[pos + 1];
          V.fadeDelta = ds[pos + 2];
          V.fadeCtr = 1;
          V.pos += 3;
        } else if (b === 0xf7) {
          // detune (added to the F-number)
          V.detune = ds[pos + 1];
          V.pos += 2;
        } else if (b === 0xf6) {
          // random poke
          const n = s8(ds[pos + 1]),
            si = pos + 2;

          this.rand();

          const r = (n - 1) & this.rng,
            chosen = ds[si + r],
            off = s8(ds[si + n]);

          ds[si + n + 1 + off] = chosen;
          V.pos += n + 3;
        } else if (b === 0xf5) {
          // volume offset (fade position)
          V.volofs = ds[pos + 1];
          V.pos += 2;
          this.volflag = 1;
        } else if (b === 0xf4) {
          // pan (0x40 = centre; stereo cards only)
          V.pan = ds[pos + 1];
          V.pos += 2;
          this.volflag = 1;
        } else {
          // 0xf3, pan slide: period, delta
          V.pansPeriod = ds[pos + 1];
          V.panDelta = ds[pos + 2];
          V.pansCtr = 1;
          V.pos += 3;
        }
      }

      // a note (or rest / end marker)
      if (this.volflag) {
        this.updateVolume(v);
      }

      const note = ds[V.pos],
        dur = ds[V.pos + 1];

      V.note = note;
      V.dur = dur;
      V.pos += 2;

      if (note === 0 || dur === 0) {
        this.keyOff(v);
      } else {
        V.gate = (dur - V.release) & 0xff;
        this.keyOn(v);
      }
    }

    // per-tick effects (cs:0x0ca9)
    if (V.slide) {
      this.pitchSlide(v);
    }

    this.volflag = 0;

    if (V.fadeCtr === 0 && V.pansCtr === 0) {
      return;
    }

    V.fadeCtr = (V.fadeCtr - 1) & 0xff;

    if (V.fadeCtr === 0) {
      V.fadeCtr = V.fadePeriod;

      if (V.fadeDelta) {
        V.volofs = (V.volofs + V.fadeDelta) & 0xff;
        this.volflag = 1;

        if (s8(V.volofs) <= 0) {
          V.fadeCtr = 0;
          V.volofs = 0;
          V.vol = 0;
        }

        if (s8(V.volofs) >= 0x3f) {
          V.fadeCtr = 0;
          V.volofs = 0x3f;
          V.vol = 0;
        }
      }
    }

    V.pansCtr = (V.pansCtr - 1) & 0xff;

    if (V.pansCtr === 0) {
      V.pansCtr = V.pansPeriod;

      if (V.panDelta) {
        V.pan = (V.pan + V.panDelta) & 0xff;
        this.volflag = 1;
      }
    }

    if (this.volflag) {
      this.updateVolume(v);
    }
  }

  // ---- driver entry points -----------------------------------------------

  /**
   * The 60 Hz tick (cs:0x115b). Returns 1 when the fast worker should start
   * running, 0xffff when it should stop, and 0 for no change.
   */
  soundWorker(): number {
    this.tick = this.ticks;
    this.sub = 0;
    this.rand();

    if (this.lock === 0xffff) {
      return this.workerReturn();
    }

    if (this.paused && this.voices[8].dur === 0) {
      for (let i = 0; i < 8; i++) {
        this.voices[i].dur = this.savedDur[i];
      }

      this.voices[8].pos = FADE_STREAM;
      this.paused = 0;
    }

    this.timer = (this.timer + 1) & 0xffff;

    for (let v = 0; v < 9; v++) {
      this.tickVoice(v); // ds:0x7532 holds v
    }

    if (this.slotCount[0] === 0 && this.slotCount[1] === 0) {
      if (this.fastState !== 0xffff) {
        this.fastState = 0xffff;
        this.ret = 0xffff;
      }

      return this.workerReturn();
    }

    for (const s of [0, 1]) {
      if (!this.slotCount[s]) {
        continue;
      }

      this.slotValue[s] = (this.slotValue[s] + this.slotInc[s]) & 0xffff;
      this.slotCount[s] = (this.slotCount[s] - 1) & 0xff;

      if (this.slotCount[s] === 0) {
        const v = this.slotVoice[s],
          o = 1 - s;

        if (this.slotCount[o] === 0 || v !== this.slotVoice[o]) {
          this.write(0xa0 + v, 0);
          this.write(0xb0 + v, 0);
        }
      }
    }

    return this.workerReturn();
  }

  private workerReturn(): number {
    const r = this.ret;

    this.ret = 0;
    this.ticks++;

    return r;
  }

  /** The ~300 Hz worker (cs:0x121f), run while `soundWorker()` last returned 1. */
  fastWorker(): void {
    this.sub++;
    this.rand();

    if (this.slotCount[0]) {
      this.rawFreq(
        this.slotVoice[0],
        (((this.rng ^ 0xffff) & this.slotMask[0]) + this.slotValue[0]) & 0xffff
      );
    }

    if (this.slotCount[1]) {
      this.rawFreq(
        this.slotVoice[1],
        ((this.rng & this.slotMask[1]) + this.slotValue[1]) & 0xffff
      );
    }
  }

  private rawFreq(v: number, w: number): void {
    // cs:0x1134
    this.write(0xa0 + v, w & 0xff);
    this.write(0xb0 + v, (w >> 8) | 0x20);
  }

  /** Ticks since the last `play()` (cs:0x0e0c). */
  soundTimer(): number {
    return this.timer;
  }

  /** Silences the chip and every voice (cs:0x0f27, PlayTune 0 and Close). */
  reset(): void {
    const saved = this.lock;

    this.lock = 0xffff;
    this.paused = 0;

    for (const V of this.voices) {
      V.dur = V.slide = V.fadeDelta = V.panDelta = 0;
    }

    for (let s = 0; s < 2; s++) {
      this.slotCount[s] = this.slotMask[s] = 0;
      this.slotValue[s] = this.slotInc[s] = 0;
    }

    for (let r = 0x4f; r > 0x3f; r--) {
      this.write(r, 0x3f);
    }

    for (let r = 0xff; r > 0x5f; r--) {
      this.write(r, 0);
    }

    for (let r = 0x3f; r > 0; r--) {
      this.write(r, 0);
    }

    this.write(1, 0x20);
    this.lock = saved;
  }

  private startVoice(v: number, stream: number): void {
    // cs:0x12b2
    const saved = this.lock,
      V = this.voices[v];

    this.lock = 0xffff;
    V.start = V.pos = V.loop1 = V.loop2 = V.restart = stream;
    V.fadePeriod = 0xff;
    V.slide = V.fadeDelta = V.panDelta = 0;
    V.detune = V.volofs = 0;
    V.vol = V.fadeCtr = V.pansCtr = 0;
    V.loop1Ctr = V.loop2Ctr = 0;
    V.release = 0;
    V.pan = 0x40;
    V.dur = 1;
    this.lock = saved;
  }

  /**
   * PlayTune (cs:0x1d80): starts sound `id` (0–44). `level` (0–3) picks the
   * arrangement for IDs 5–18. ID 0 resets, 1 fades everything out, and 2
   * returns non-zero while anything is still playing.
   */
  play(id: number, level = 3): number {
    if (id > 0x2c) {
      return 0;
    }

    const r = this.playTune(id, level);

    this.timer = 0;

    return r;
  }

  private playTune(id: number, level: number): number {
    const ds = this.ds;

    if (id === 0) {
      this.reset();

      return 0;
    }

    if (id === 1) {
      // fade everything out
      for (const V of this.voices) {
        V.pos = FADE_STREAM;
        V.fadeDelta = 0xff;
        V.fadePeriod = 1;
        V.fadeCtr = 1;
      }

      return 0;
    }

    if (id === 2) {
      // query: anything still playing?
      return this.voices.reduce((r, V) => r | V.dur, 0);
    }

    if (id === 33) {
      // interrupt the music with one of seven jingles (the war drums) on voice 8
      const saved = this.lock;

      this.lock = 0xffff;

      for (let i = 0; i < 8; i++) {
        this.savedDur[i] = this.voices[i].dur;
        this.voices[i].dur = 0;
      }

      for (const op of [0x43, 0x44, 0x45, 0x4b, 0x4c, 0x4d, 0x53, 0x54, 0x55]) {
        this.write(op, this.shadow[op] | 0x3f);
      }

      this.paused = 0xff;
      this.lock = saved;
      this.id33Index++;

      if (this.id33Index > 6) {
        this.id33Index = 0;
      }

      this.startVoice(8, ID33_STREAMS[this.id33Index]);

      return 0;
    }

    if (id === 38 || id === 39) {
      if (id === 39) {
        this.startVoice(0, 0x68a4);
      }

      const stream = id === 38 ? 0x6898 : 0x688c;

      this.rand();

      const ax = ((this.rng & 0x707) + 0x140c) & 0xffff,
        al = ax & 0xff,
        ah = ax >> 8;

      ds[stream + 5] = al;
      ds[stream + 7] = ah;
      ds[0x68a5] = al + ah;
      this.startVoice(1, stream);

      return 0;
    }

    if (id === 44) {
      this.rand();
      ds[0x68fa + 1] = (this.rng & 7) + 0xe;
      this.startVoice(0, 0x68fa);
      this.rand();
      ds[0x6900 + 1] = (this.rng & 7) + 0x1c;
      this.startVoice(1, 0x6900);
      this.rand();
      ds[0x6906 + 1] = (this.rng & 7) + 0x2a;
      this.startVoice(2, 0x6906);

      for (const v of [0, 1, 2]) {
        this.voices[v].loop1 = 0x690c;
      }

      this.startVoice(3, 0x690c);

      return 0;
    }

    const tune: Arrangement | readonly Arrangement[] | undefined = TUNES[id];

    if (!tune) {
      return 0;
    }

    const arrangement = (
      typeof tune[0][0] === 'number'
        ? tune
        : (tune as readonly Arrangement[])[level & 3]
    ) as Arrangement;

    for (const [v, stream] of arrangement) {
      this.startVoice(v, stream);
    }

    return 0;
  }
}

export default Driver;
