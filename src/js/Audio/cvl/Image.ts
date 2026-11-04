// The player's own `ASOUND.CVL`, Civilization's (1991) AdLib sound driver, as
// the parts `Driver` reads. The file is an MZ executable whose data segment
// holds every tune as bytecode (docs/asound-cvl-format.md). None of it is in
// this repository: the bytes always come from the player.
//
// A port of tools/asound-cvl/cvl.py. "DS" offsets are inside the driver's data
// segment, which starts at image offset 0x1e20.

export const DS_OFFSET = 0x1e20;
export const PATCH_TABLE = 0x695a; // DS-relative
export const PATCH_SIZE = 0x2c;

export class Image {
  /** The data segment as in the file. `Driver` plays from its own copy. */
  readonly ds: Uint8Array;
  /** F-numbers for the twelve semitones, ds:0x73a8. */
  readonly fnum: readonly number[];
  /** ds:0x7328, 128 bytes. */
  readonly pan: readonly number[];
  /** Modulator and carrier operator index for each of the nine voices, ds:0x73c6. */
  readonly voiceOps: readonly (readonly [number, number])[];
  /** Register offset of each of the eighteen operators, ds:0x73d8. */
  readonly opReg: readonly number[];
  /** ds:0x73fd. */
  readonly rngSeed: number;

  constructor(data: ArrayBuffer | Uint8Array) {
    const file = data instanceof Uint8Array ? data : new Uint8Array(data);

    if (file.length < 0x20 || file[0] !== 0x4d || file[1] !== 0x5a) {
      throw new TypeError('ASOUND.CVL: not an MZ executable');
    }

    const header = (file[8] | (file[9] << 8)) * 16;

    this.ds = file.subarray(header + DS_OFFSET);

    if (this.ds.length < 0x73ff) {
      throw new TypeError('ASOUND.CVL: too short for the AdLib driver');
    }

    this.fnum = Array.from({ length: 12 }, (_, i) => this.word(0x73a8 + 2 * i));
    this.pan = Array.from(this.ds.subarray(0x7328, 0x7328 + 128));
    this.voiceOps = Array.from(
      { length: 9 },
      (_, i) => [this.ds[0x73c6 + 2 * i], this.ds[0x73c6 + 2 * i + 1]] as const
    );
    this.opReg = Array.from(this.ds.subarray(0x73d8, 0x73d8 + 18));
    this.rngSeed = this.word(0x73fd);
  }

  byte(address: number): number {
    return this.ds[address];
  }

  word(address: number): number {
    return this.ds[address] | (this.ds[address + 1] << 8);
  }
}

export default Image;
