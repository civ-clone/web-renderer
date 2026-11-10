// A Yamaha YM3812 (OPL2) FM synthesiser, written for this project (#126) from
// the chip's documented behaviour: the YM3812 application manual, and the
// published reverse-engineering of its log-sine and exponent tables and its
// envelope generator. It plays the register writes packages/audio/cvl/Driver.ts
// makes, so it covers what Civilization's AdLib tunes use: the nine melodic
// two-operator channels (FM and additive), feedback, the four waveforms (with
// register 01's waveform-select enable), multipliers, key scale level and
// rate, the note-select bit, sustaining and percussive envelopes, tremolo and
// vibrato at either depth, and total level. Rhythm mode, CSM and the timers
// are left out.
//
// The chip runs at its own 49,716 Hz sample clock (a 3.579545 MHz crystal over
// 72), so a note's pitch is F · 49716 / 2^(20 − block) whatever rate the output
// runs at; `generate()` resamples to that rate with linear interpolation.
//
// Writes apply in order, at once: a key-off and a key-on between two
// `generate()` calls retrigger the note, a key-on while the key is already on
// does nothing, and frequency and level writes never touch the phase.
//
// Units, as on the chip: phase is 10 bits a cycle; an operator's attenuation
// is 1/256 of a factor of two before the exponent table, and the envelope
// counts 0.1875 dB steps from 0 (full level) to 511 (silent).

export const CHIP_RATE = 49716;

// A quarter of a sine as -log2, in 1/256ths, and 2^x for the fraction.
const LOG_SIN = new Uint16Array(256);
const EXP = new Uint16Array(256);

for (let i = 0; i < 256; i++) {
  LOG_SIN[i] = Math.round(
    -Math.log2(Math.sin(((i + 0.5) * Math.PI) / 512)) * 256
  );
  EXP[i] = Math.round(Math.pow(2, i / 256) * 1024) - 1024;
}

// The frequency multiplier, doubled so ½ is a whole number.
const MULT2 = [1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 20, 24, 24, 30, 30];

// Key scale level: 6 dB an octave in envelope steps, from the top four bits of
// the F-number, then halved or quartered by the KSL setting (0 is off,
// 1 is 3 dB an octave, 2 is 1.5 and 3 is 6).
const KSL_ROM = [0, 32, 40, 45, 48, 51, 53, 55, 56, 58, 59, 60, 61, 62, 63, 64];
const KSL_SHIFT = [16, 1, 2, 0];

// The envelope is clocked every other chip sample. A rate's top two bits pick
// how often it steps (each one twice as often as the last) and its bottom two
// bits how many of every eight steps count; from rate 48 up it steps every
// clock, by one, two or four, and from 60 it's instant (attack) or 8 a clock.
const EG_LOW = [
  [0, 1, 0, 1, 0, 1, 0, 1],
  [0, 1, 0, 1, 1, 1, 0, 1],
  [0, 1, 1, 1, 0, 1, 1, 1],
  [0, 1, 1, 1, 1, 1, 1, 1],
];
const EG_HIGH = [
  [1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 2, 1, 1, 1, 2],
  [1, 2, 1, 2, 1, 2, 1, 2],
  [1, 2, 2, 2, 1, 2, 2, 2],
];

// The tremolo is a triangle over 210 positions, one every 64 samples (3.7 Hz),
// of up to 4.8 dB, or 1 dB when shallow. The vibrato has eight positions, one
// every 1,024 samples (6.1 Hz), and moves the F-number by up to 1/128 of it
// (about 14 cents), or half that when shallow.
const TREMOLO_LENGTH = 210;
const VIBRATO = [0, 1, 2, 1, 0, -1, -2, -1];

const enum Stage {
  Attack,
  Decay,
  Sustain,
  Release,
}

const MAX_ATTENUATION = 511;

class Operator {
  // Register 20
  tremolo = false;
  vibrato = false;
  sustaining = false;
  ksr = false;
  mult = 0;
  // Register 40
  ksl = 0;
  totalLevel = 0;
  // Registers 60, 80, E0
  attack = 0;
  decay = 0;
  sustainLevel = 0;
  release = 0;
  waveform = 0;

  stage = Stage.Release;
  envelope = MAX_ATTENUATION;
  phase = 0; // 19 bits; the top 10 are the waveform's position
  kslAttenuation = 0; // from the channel's frequency
  keyCode = 0; // likewise, for key scale rate

  // The last two outputs, for the modulator's feedback.
  out = 0;
  previous = 0;

  rate(value: number): number {
    if (value === 0) {
      return 0;
    }

    return Math.min(
      63,
      value * 4 + (this.ksr ? this.keyCode : this.keyCode >> 2)
    );
  }

  keyOn(): void {
    this.phase = 0;
    this.stage = Stage.Attack;

    if (this.rate(this.attack) >= 60) {
      this.envelope = 0;
      this.stage = Stage.Decay;
    }
  }

  keyOff(): void {
    this.stage = Stage.Release;
  }

  clockEnvelope(clock: number): void {
    const stage = this.stage,
      rate = this.rate(
        stage === Stage.Attack
          ? this.attack
          : stage === Stage.Decay
          ? this.decay
          : stage === Stage.Release || !this.sustaining
          ? this.release
          : 0
      );

    if (stage === Stage.Decay) {
      const level = this.sustainLevel === 15 ? 31 : this.sustainLevel;

      if (this.envelope >> 4 >= level) {
        this.stage = Stage.Sustain;

        return this.clockEnvelope(clock);
      }
    }

    if (rate === 0) {
      return;
    }

    const high = rate >> 2,
      low = rate & 3;
    let step: number;

    if (high < 12) {
      const shift = 11 - high;

      if ((clock & ((1 << shift) - 1)) !== 0) {
        return;
      }

      step = EG_LOW[low][(clock >> shift) & 7];
    } else if (high < 15) {
      step = EG_HIGH[low][clock & 7] << (high - 12);
    } else {
      step = 8;
    }

    if (stage === Stage.Attack) {
      if (high === 15) {
        this.envelope = 0;
      } else if (step) {
        this.envelope += (~this.envelope * step) >> 3;
      }

      if (this.envelope <= 0) {
        this.envelope = 0;
        this.stage = Stage.Decay;
      }

      return;
    }

    if (stage === Stage.Sustain && this.sustaining) {
      return;
    }

    this.envelope = Math.min(MAX_ATTENUATION, this.envelope + step);
  }

  // One sample at `phase` + `modulation` (10 bits a cycle), at `extra`
  // envelope steps of tremolo, then the phase moves on by `increment`.
  output(modulation: number, extra: number, increment: number): number {
    const attenuation = Math.min(
        MAX_ATTENUATION,
        this.envelope + (this.totalLevel << 2) + this.kslAttenuation + extra
      ),
      position = ((this.phase >> 9) + modulation) & 0x3ff,
      value = waveform(this.waveform, position, attenuation << 3);

    this.phase = (this.phase + increment) & 0x7ffff;

    return value;
  }
}

const waveform = (shape: number, position: number, attenuation: number) => {
  const mirrored = position & 0x100 ? ~position & 0xff : position & 0xff;
  let negative = false,
    index = mirrored;

  switch (shape) {
    case 0: // sine
      negative = (position & 0x200) !== 0;
      break;

    case 1: // half sine
      if (position & 0x200) {
        return 0;
      }
      break;

    case 2: // absolute sine
      break;

    default:
      // quarter sines, rising
      if (position & 0x100) {
        return 0;
      }

      index = position & 0xff;
  }

  const total = LOG_SIN[index] + attenuation,
    shift = total >> 8;

  if (shift > 12) {
    return 0;
  }

  const value = ((EXP[~total & 0xff] | 0x400) << 1) >> shift;

  return negative ? -value : value;
};

class Channel {
  fnum = 0;
  block = 0;
  keyOn = false;
  feedback = 0;
  additive = false;

  constructor(readonly modulator: Operator, readonly carrier: Operator) {}
}

// Register offsets 00–15 to operators, -1 for the gaps.
const OPERATOR_AT = Array.from({ length: 0x20 }, (_, offset) =>
  offset % 8 < 6 && offset < 0x16 ? (offset >> 3) * 6 + (offset % 8) : -1
);

export class Opl2 {
  readonly sampleRate: number;

  private readonly operators = Array.from({ length: 18 }, () => new Operator());
  private readonly channels: Channel[];
  private waveformSelect = false; // register 01 bit 5
  private noteSelect = false; // register 08 bit 6
  private deepTremolo = false; // register BD bit 7
  private deepVibrato = false; // register BD bit 6
  private readonly waveforms = new Uint8Array(18); // register E0, as written

  private samples = 0; // chip samples made
  private tremoloPosition = 0;
  private envelopeClock = 0;

  // Resampling: the two chip samples either side of the next output frame.
  private readonly step: number;
  private position = 1;
  private before = 0;
  private after = 0;

  constructor(sampleRate: number = CHIP_RATE) {
    this.sampleRate = sampleRate;
    this.step = CHIP_RATE / sampleRate;
    // Operators 0–2 and 6–8 and 12–14 modulate 3–5, 9–11 and 15–17, channel by
    // channel: 0, 1, 2 from the first group of six, and so on.
    this.channels = Array.from({ length: 9 }, (_, channel) => {
      const first = Math.floor(channel / 3) * 6 + (channel % 3);

      return new Channel(this.operators[first], this.operators[first + 3]);
    });
  }

  write(register: number, value: number): void {
    register &= 0xff;
    value &= 0xff;

    const group = register & 0xe0,
      low = register & 0x1f;

    if (register === 0x01) {
      this.waveformSelect = (value & 0x20) !== 0;
      this.operators.forEach((operator, i) => {
        operator.waveform = this.waveformSelect ? this.waveforms[i] : 0;
      });

      return;
    }

    if (register === 0x08) {
      this.noteSelect = (value & 0x40) !== 0;
      this.channels.forEach((channel) => this.frequencyChanged(channel));

      return;
    }

    if (register === 0xbd) {
      this.deepTremolo = (value & 0x80) !== 0;
      this.deepVibrato = (value & 0x40) !== 0;

      return;
    }

    if ((group >= 0x20 && group <= 0x80) || group === 0xe0) {
      const index = OPERATOR_AT[low];

      if (index === -1) {
        return;
      }

      const operator = this.operators[index];

      switch (group) {
        case 0x20:
          operator.tremolo = (value & 0x80) !== 0;
          operator.vibrato = (value & 0x40) !== 0;
          operator.sustaining = (value & 0x20) !== 0;
          operator.ksr = (value & 0x10) !== 0;
          operator.mult = value & 0xf;
          break;

        case 0x40:
          operator.ksl = value >> 6;
          operator.totalLevel = value & 0x3f;
          this.channels.forEach(
            (channel) =>
              (channel.modulator === operator ||
                channel.carrier === operator) &&
              this.frequencyChanged(channel)
          );
          break;

        case 0x60:
          operator.attack = value >> 4;
          operator.decay = value & 0xf;
          break;

        case 0x80:
          operator.sustainLevel = value >> 4;
          operator.release = value & 0xf;
          break;

        case 0xe0:
          this.waveforms[index] = value & 3;
          operator.waveform = this.waveformSelect ? value & 3 : 0;
          break;
      }

      return;
    }

    if ((register & 0xf) > 8 || register < 0xa0) {
      return;
    }

    const channel = this.channels[register & 0xf];

    switch (register & 0xf0) {
      case 0xa0:
        channel.fnum = (channel.fnum & 0x300) | value;
        this.frequencyChanged(channel);
        break;

      case 0xb0: {
        const keyOn = (value & 0x20) !== 0;

        channel.fnum = (channel.fnum & 0xff) | ((value & 3) << 8);
        channel.block = (value >> 2) & 7;
        this.frequencyChanged(channel);

        if (keyOn && !channel.keyOn) {
          channel.modulator.keyOn();
          channel.carrier.keyOn();
        } else if (!keyOn && channel.keyOn) {
          channel.modulator.keyOff();
          channel.carrier.keyOff();
        }

        channel.keyOn = keyOn;
        break;
      }

      case 0xc0:
        channel.feedback = (value >> 1) & 7;
        channel.additive = (value & 1) !== 0;
        break;
    }
  }

  private frequencyChanged(channel: Channel): void {
    const { fnum, block } = channel,
      keyCode = (block << 1) | ((this.noteSelect ? fnum >> 8 : fnum >> 9) & 1),
      ksl = Math.max(0, (KSL_ROM[fnum >> 6] << 2) - ((8 - block) << 5));

    [channel.modulator, channel.carrier].forEach((operator) => {
      operator.keyCode = keyCode;
      operator.kslAttenuation = ksl >> KSL_SHIFT[operator.ksl];
    });
  }

  private increment(operator: Operator, channel: Channel, vibrato: number) {
    let fnum = channel.fnum;

    if (operator.vibrato) {
      const range = fnum >> 7;

      fnum += (VIBRATO[vibrato] * range) >> (this.deepVibrato ? 1 : 2);
    }

    return ((((fnum << channel.block) >> 1) * MULT2[operator.mult]) >> 1) | 0;
  }

  /** The next chip sample, the nine channels' sum. */
  private sample(): number {
    if ((this.samples & 1) === 0) {
      this.envelopeClock++;
      this.operators.forEach((operator) =>
        operator.clockEnvelope(this.envelopeClock)
      );
    }

    const triangle =
        this.tremoloPosition < TREMOLO_LENGTH / 2
          ? this.tremoloPosition
          : TREMOLO_LENGTH - 1 - this.tremoloPosition,
      tremolo = triangle >> (this.deepTremolo ? 2 : 4),
      // Where the vibrato starts is the chip's power-on state; one position
      // in is where pyopl starts it, so renders line up.
      vibrato = ((this.samples >> 10) + 1) & 7;
    let sum = 0;

    for (const channel of this.channels) {
      const { modulator, carrier } = channel,
        feedback = channel.feedback
          ? (modulator.out + modulator.previous) >> (9 - channel.feedback)
          : 0,
        modulation = modulator.output(
          feedback,
          modulator.tremolo ? tremolo : 0,
          this.increment(modulator, channel, vibrato)
        );

      modulator.previous = modulator.out;
      modulator.out = modulation;

      const out = carrier.output(
        channel.additive ? 0 : modulation,
        carrier.tremolo ? tremolo : 0,
        this.increment(carrier, channel, vibrato)
      );

      sum += channel.additive ? out + modulation : out;
    }

    this.samples++;

    if ((this.samples & 63) === 0) {
      this.tremoloPosition = (this.tremoloPosition + 1) % TREMOLO_LENGTH;
    }

    // Doubled, to the level pyopl (DOSBox's OPL) plays at, so renders compare
    // like for like, and clipped to 16 bits.
    return Math.max(-32768, Math.min(32767, sum * 2));
  }

  /** Fills `frames` frames of `out` from `offset`, in -1…1. */
  generate(out: Float32Array, offset: number, frames: number): void {
    for (let i = 0; i < frames; i++) {
      while (this.position >= 1) {
        this.before = this.after;
        this.after = this.sample();
        this.position -= 1;
      }

      out[offset + i] =
        (this.before + (this.after - this.before) * this.position) / 32768;
      this.position += this.step;
    }
  }
}

export default Opl2;
