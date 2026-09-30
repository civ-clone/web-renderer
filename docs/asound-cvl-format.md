# `ASOUND.CVL`: the Civilization (1991) AdLib sound driver and its music format

This describes the AdLib / Sound Blaster sound driver shipped with MicroProse's *Sid Meier's
Civilization* (DOS, v474.05 files dated 1996), including the bytecode that holds every tune and
sound effect. Everything here was recovered by disassembling the driver and confirmed by running
the original code in an emulator; see [`asound-cvl-reverse-engineering.md`](./asound-cvl-reverse-engineering.md)
for the method and the tooling, and [`../tools/asound-cvl/`](../tools/asound-cvl/) for a
reference implementation that reproduces the driver's OPL2 register writes exactly.

Offsets are hexadecimal. "Image" means the file after its 512-byte MZ header (image offset
`x` is file offset `x + 0x200`). "DS" means the driver's data segment, which starts at image
offset `0x1E20` (file offset `0x2020`). A "tick" is one call of the driver's `SoundWorker`,
1/60 s.

## 1. What the file is

There are no music files in Civilization. Each sound device has its own driver, a small DOS
`.EXE` (MZ) loaded as an overlay with `INT 21h/4B03h`, and the drivers contain the music as
data compiled into their data segment:

| File | Bytes | ID string at image `+0x10` | Device |
| --- | ---: | --- | --- |
| `ASOUND.CVL` | 37,923 | `RLND Cvlzatn12-03-91` | AdLib / Sound Blaster / Pro AudioSpectrum (OPL2, also dual-OPL2 stereo) |
| `RSOUND.CVL` | 37,322 | `RLND Cvlzatn12-03-91` | Roland MT-32 (MPU-401) |
| `TSOUND.CVL` | 28,055 | `Tandy CIVIL 12-02-91` | Tandy 3-voice |
| `ISOUND.CVL` | 18,264 | `Civil IBM   11-14-91` | PC speaker |
| `NSOUND.CVL` | 720 | `CVLZTN NoSnd10-16-91` | none |

Only `ASOUND.CVL` is decoded here. The others share the overlay layout and entry points
(section 2) and, judging by their sizes, the same bytecode with device-specific players, but
that has not been checked. MicroProse's 1994 add-on drivers (`PSOUND.CVL` for OPL3,
`GSOUND.CVL` for General MIDI, ID strings `Pro Civlzatn 3-03-94` and `GMID Cvlzatn 3-04-94`)
use the same table and the same kind of streams; `PSOUND.CVL` even carries a debug string
naming the voice-state fields, `Dur Not Vce Pan Dpn Gat Vol Cvl Dvl Start NTptr SRptr SRcnt
MRptr MRcnt`, which match the fields in §4.4 (sub-repeat and main-repeat are the two loop
levels). The GM driver plays re-scored versions of the same pieces on the same 60 Hz tick, and
its MIDI note numbers equal the AdLib stream notes plus 19, confirming §4.1.

## 2. Overlay layout and entry points

### MZ header

Standard. `e_cparhdr = 0x20` (512-byte header), 13 relocations (segment fix-ups of far calls
and of the two segment words below), `e_ip = 0x10`, `e_cs = 0`. Nothing is packed.

### Image header

| Image offset | Contents |
| --- | --- |
| `0x00`–`0x0F` | zero |
| `0x10`–`0x23` | ID string `RLND Cvlzatn12-03-91` |
| `0x28` | word: code segment (0, relocated) |
| `0x2A` | word: data segment in paragraphs relative to the load segment: `0x1E2`, i.e. image `+0x1E20` (relocated) |
| `0x2C` | word: data segment size `0x76A0` (the image ends at DS `+0x7403`; the rest is BSS) |
| `0x2E` | word: `0x64` (unused by the game as far as we can tell) |
| `0x30` | word: number of functions, 11 |
| `0x32`–`0x47` | 11 words: offsets of the far functions in the code segment |

The function table for `ASOUND.CVL`:

| # | Offset | Name | Arguments | Returns (AX) |
| --- | --- | --- | --- | --- |
| 1 | `0x1D66` | `Init(unused)` | one word, stored at DS `0x73FB` and never read | 0 = card found, `0x41` = no OPL2 detected |
| 2 | `0x1D80` | `PlayTune(id, level)` | `id` 0–44 (anything else is ignored), `level` 0–3 (only IDs 5–18 read it) | 0, except ID 2 (see §3) |
| 3 | `0x1DD8` | `Close()` | – | pending `SoundWorker` value; also resets the chip and re-reads the RTC into the DOS clock |
| 4 | `0x1DF3` | `SoundWorker()` | – | 1 = start calling `FastSoundWorker`, `0xFFFF` = stop calling it, 0 = no change |
| 5 | `0x1E07` | `FastSoundWorker()` | – | 0 |
| 6 | `0x1E14` | `SoundTimer()` | – | number of `SoundWorker` ticks since the last `PlayTune` |
| 7–11 | `0x1DA3` | – | – | a bare `retf` |

All are far, C calling convention, word arguments pushed right to left. Each function loads its
own DS from the relocated constant, so the caller's DS does not matter. The game calls
`SoundWorker` at 60 Hz (CivPlay programs the PIT to 300.1 Hz and calls it every fifth
interrupt) and `FastSoundWorker` on every 300 Hz interrupt while the last non-zero
`SoundWorker` result was 1. Every timing figure below follows from those rates.

### Code segment map (image offsets)

The driver is compiled C (Microsoft C style frames) with hand-written assembly entry stubs.

| Offset | Routine |
| --- | --- |
| `0x0048` | `update_volume(voice)` – writes the carrier's level register |
| `0x017C` | `set_frequency(voice)` – A0/B0 from the note |
| `0x0230` | `pitch_slide(voice)` – per-tick slide |
| `0x02BE` | `key_off(voice)` |
| `0x02EC` | `key_on(voice)` |
| `0x04B4` | `write_operator(voice, op, patch)` |
| `0x06C8` | `load_patch(voice, n)` |
| `0x07F4` | `tick_voice()` – the bytecode interpreter, one voice per call |
| `0x0DAC` | tick all nine voices |
| `0x0E1B` | `Init` body: OPL2 detection, dual-OPL2 and Pro AudioSpectrum probing |
| `0x0F27` | reset: silence and clear every register (used by `PlayTune(0)` and `Close`) |
| `0x10DB` | `opl_write(reg, value)` – keeps a shadow copy of every register at DS `0x7536` |
| `0x1134` | write a raw block:F-number with key-on (noise effects) |
| `0x114A` | random number generator |
| `0x115B` | `SoundWorker` body |
| `0x121F` | `FastSoundWorker` body |
| `0x12B2` | `start_voice(voice, stream)` |
| `0x1309` | `PlayTune(1)`: fade out |
| `0x1455` | `PlayTune(2)`: is anything playing |
| `0x1547` | `PlayTune(33)`: war drums |
| `0x160A`–`0x1D0B` | the other per-ID handlers |
| `0x1D0C` | 45-word jump table indexed by ID |
| `0x1D66`–`0x1E18` | entry stubs |
| `0x1E30` | `Copyright (C) 1991 by MicroProse Software, All Rights Reserved.` |

Three routines (`0x0FD0`, `0x1359`, `0x13A8`) are never called.

### Data segment map (DS offsets)

| DS offset | Contents |
| --- | --- |
| `0x0000`–`0x004F` | 16 zero bytes, then the copyright string |
| `0x0050`–`0x6959` | 231 voice streams, 28,326 bytes (the bytecode, §4). The first seven are the war-drum patterns |
| `0x695A`–`0x7325` | 57 instrument patches × 44 bytes (§5) |
| `0x7328`–`0x73A7` | 128-byte pan attenuation curve (stereo cards only) |
| `0x73A8`–`0x73BF` | 12 words: F-numbers for the 12 notes of an octave: 512, 542, 575, 609, 645, 683, 724, 767, 813, 861, 912, 967 |
| `0x73C0`, `0x73C2`, `0x73C4` | flags, all 1: deep tremolo, deep vibrato, note select |
| `0x73C6`–`0x73D7` | voice → (modulator, carrier) operator index: (0,3) (1,4) (2,5) (6,9) (7,10) (8,11) (12,15) (13,16) (14,17) |
| `0x73D8`–`0x73E9` | operator index → register offset: 0 1 2 3 4 5 8 9 10 11 12 13 16 17 18 19 20 21 |
| `0x73F5` | word: index of the last war-drum pattern (initially 1) |
| `0x73FD` | word: random number state, seed `0x04D2` |
| `0x7401` | word: card mode (0/1 mono OPL2, 2 dual OPL2, 3 Pro AudioSpectrum) |
| `0x741A` | word: `0xFFFF` while a handler is changing voice state; `SoundWorker` returns at once when set |
| `0x741C`, `0x743A`, `0x7458`, `0x7476`, `0x7494`, `0x74B2`, `0x74D0`, `0x74F0`, `0x7510` | the nine 30-byte voice states (§4.4) |
| `0x7532` | byte: voice currently being ticked |
| `0x7536`–`0x7635` | shadow copy of the 256 OPL registers |
| `0x7636`–`0x767D` | 8 bytes per voice: pitch-sweep parameters of the current instrument |
| `0x7692` | word: pointer to the voice state being ticked |

Everything from `0x7403` on is zero-filled BSS in the emulation; DOS does not clear it, but the
driver initialises every field it reads except one flag noted in §7.

## 3. Sound IDs

`PlayTune(id, level)` looks `id` up in the jump table. Handlers 3–44 do nothing but assign a
stream to each voice the sound uses (`start_voice`), so a sound is simply a set of (voice,
stream) pairs. Voices not named by the new sound keep playing whatever they had: a battle
sound on voice 1 replaces only voice 1 of the current music, and that voice stays silent
afterwards until the next `PlayTune`. `PlayTune` also zeroes the `SoundTimer` count.

| ID | What the handler does |
| --- | --- |
| 0 | Reset: every voice stops, all registers cleared, carriers silenced, waveform select enabled |
| 1 | Fade out: every voice's next-event pointer is set to an "end" stream and a fade of −1 loudness per tick is started; notes already sounding fade over about a second, then stop |
| 2 | Query: returns non-zero if any voice is still playing. Writes nothing |
| 3 | Main theme: voices 0–7 |
| 4 | Evolution (world creation): voices 0–7 |
| 5–18 | Long national themes. `level` (0–3) selects one of four arrangements; the game passes 3 |
| 19–32 | Short national themes |
| 33 | War drums, see below |
| 34, 35 | Win, lose |
| 36 | Civil disorder / Barbarians: voices 1–6 |
| 37 | Illegal move: voice 0 |
| 38 | Battle won: voice 1. Two bytes of the stream are randomised first (`rand & 0x707 + 0x140C`, low byte to `+5`, high byte to `+7`, and their sum to DS `0x68A5`) |
| 39 | Battle lost: voice 0 (a slide down) and voice 1, randomised the same way |
| 40, 41 | Modern battle won / lost: explosion noise on voice 6, or voices 2 and 3 |
| 42 | Nuclear explosion: voices 4 and 5 |
| 43 | Bomber: voices 0 and 1 |
| 44 | City completed a build: voices 0–3 play the same arpeggio as a four-part canon. The rests before voices 0, 1 and 2 are randomised to 14–21, 28–35 and 42–49 ticks |

**War drums (33).** The handler saves the tick counters of voices 0–7 and zeroes them
(pausing the music), forces every carrier's level register to silent, and starts one of seven
drum patterns on voice 8. The pattern index cycles 0–6 (it is not random). When voice 8 goes
idle, `SoundWorker` restores the eight counters and the music resumes where it stopped; a
paused voice stays silent until its next note re-applies its volume.

**Arrangement levels.** For IDs 5–18 the second argument adds voices; level 3 is the full
arrangement. The table lists the stream given to each voice at level 3 and, in brackets, the
level at which that voice first appears.

| ID | Voice → stream (level) |
| --- | --- |
| 3 | 0:`4AA8` 1:`4BF8` 2:`4D1C` 3:`4DBE` 4:`4E78` 5:`4F30` 6:`4FBA` 7:`5040` |
| 4 | 0:`2DA4` 1:`3014` 2:`3170` 3:`33F4` 4:`360E` 5:`38B6` 6:`3A2A` 7:`3CEE` |
| 5 | 0:`297A`(3) 1:`2A5E`(2) 2:`2AFA`(1) 3:`2C76`(0) |
| 6 | 0:`0540`(3) 1:`05B0`(2) 2:`066C`(1) 3:`06A4`(0) |
| 7 | 0:`0742`(2) 1:`080C`(1) 2:`0864`(1) 3:`08BE`(1) 4:`0918`(2) 6:`0928`(0) |
| 8 | 0:`0A02`(3) 1:`0A96`(2) 2:`0B1C`(1) 6:`0BA6`(0) |
| 9 | 0:`5E0E`(3) 1:`5EAC`(3) 2:`5F48`(2) 3:`6036`(2) 4:`6090`(0) 5:`615C`(1) 6:`622C`(1) 7:`62F8`(0) |
| 10 | 0:`0D36`(3) 1:`0DCC`(2) 2:`0E8E`(0) 3:`0FBC`(1) 4:`10EC`(1) 5:`1168`(2) 6:`0F4E`(0) 7:`1072`(1) |
| 11 | 0:`3FDE`(1) 1:`405C`(1) 2:`4100`(2) 3:`41D0`(2) 4:`424A`(2) 5:`42AE`(2) 6:`4312`(0) 7:`438A`(0) |
| 12 | 0:`1F6A`(2) 1:`2148`(2) 2:`232A`(1) 3:`24E2`(0) 4:`2562`(0) 5:`25E2`(0) 6:`268C`(0) 7:`26E4`(1) |
| 13 | 0:`5886`(2) 1:`5A1A`(1) 2:`5B96`(0) 3:`5C16`(0) 4:`5D14`(1) |
| 14 | 0:`133A`(2) 1:`143A`(1) 2:`1534`(0) 3:`1586`(0) 4:`15D4`(0) 5:`161E`(0) 6:`166A`(0) |
| 15 | 0:`02D0`(3) 1:`0362`(2) 2:`03FA`(1) 3:`043E`(0) 4:`0468`(0) 5:`0490`(0) 6:`03AC`(2) |
| 16 | 0:`187C`(0) 1:`18C8`(0) 2:`1924`(1) 3:`1970`(0) 4:`199E`(2) 5:`196E`(0) 6:`19A0`(2) 7:`18C6`(0) |
| 17 | 0:`1A68`(3) 1:`1C16`(2) 2:`1DC2`(1) 3:`1DE0`(1) 4:`1DFC`(1) 5:`1E18`(1) 6:`1E32`(0) 7:`1E86`(0) |
| 18 | 0:`4504`(2) 1:`4604`(1) 2:`46F6`(0) 3:`47F0`(0) 4:`48D0`(1) 5:`49A8`(3) |
| 19 | 0:`2D18` 1:`2D3E` 2:`2D56` 3:`2D88` |
| 20 | 0:`06E6` 1:`0700` 2:`0716` 3:`0730` |
| 21 | 0:`0988` 1:`09AA` 2:`09CC` 6:`09F0` |
| 22 | 0:`0C84` 1:`0CB0` 2:`0CD8` 6:`0D00` |
| 23 | 0:`632A` 1:`6346` 2:`6366` 3:`6382` 4:`639E` 5:`63AE` |
| 24 | 0:`1222` 1:`1264` 2:`12AA` 3:`12E6` 4:`1310` |
| 25 | 0:`4448` 1:`445A` 2:`446C` 3:`447E` 4:`4498` 5:`44B2` 6:`44CC` 7:`44E6` |
| 26 | 0:`2870` 1:`2896` 2:`28BC` 3:`28E2` 4:`2908` 5:`292E` 6:`2954` |
| 27 | 0:`5D92` 1:`5DAC` 2:`5DC6` 3:`5DD6` 4:`5DEE` |
| 28 | 0:`17C2` 1:`17D2` 2:`17E2` 3:`1804` 4:`181C` 5:`1834` 6:`184C` |
| 29 | 0:`04BA` 1:`04D8` 2:`04EC` 3:`04FE` 4:`050E` 5:`051C` 6:`052C` |
| 30 | 0:`1A14` 1:`1A24` 2:`1A34` 3:`1A46` 4:`1A22` 5:`1A44` 6:`1A56` 7:`1A58` |
| 31 | 0:`1EB6` 1:`1EC8` 2:`1EDA` 3:`1EEC` 4:`1F02` 5:`1F40` |
| 32 | 0:`4A2E` 1:`4A4C` 2:`4A6A` 3:`4A88` 4:`4A98` |
| 33 | 8: one of `0208` `027E` `0050` `0098` `00F2` `0138` `01A4` |
| 34 | 0:`5156` 1:`51E6` 2:`5276` 3:`5456` 4:`54D6` 5:`5556` 6:`5736` 7:`5830` |
| 35 | 0:`63CE` 1:`6446` 2:`64A0` 3:`64F4` 4:`6542` 5:`6590` 6:`6604` |
| 36 | 1:`32C2` 2:`34DA` 3:`3804` 4:`3976` 5:`3BF6` 6:`3EDC` |
| 37 | 0:`68EE` |
| 38 | 1:`6898` |
| 39 | 0:`68A4` 1:`688C` |
| 40 | 6:`6870` |
| 41 | 2:`687C` 3:`6864` |
| 42 | 4:`68C6` 5:`68B4` |
| 43 | 0:`68D2` 1:`68E2` |
| 44 | 0:`68FA` 1:`6900` 2:`6906` 3:`690C` (voices 0–2 also get their loop start set to `690C`) |
| 1 | every voice: `5EAA` (the two bytes `00 00`) |

The civilisation order of IDs 5–18 and 19–32 is Americans, Aztecs, Egyptians, Zulus, French,
Romans, Russians, Greeks, English, Babylonians, Chinese, Mongols, Indians, Germans (from
OpenCivOne's tables; the driver itself has no names).

## 4. Voice streams (the bytecode)

Each of the nine OPL2 channels ("voices") runs its own stream. A stream is a flat byte
sequence of two-byte notes and short commands, read in place from the data segment. Streams
can overlap: the canon of ID 44 is one arpeggio entered at three different offsets.

### 4.1 Notes

Any byte below `0xF3` starts a note: `note, duration`.

- `note` 1–83: pitch. `note 0` is a rest. Values `0x80`–`0xF2` would be read as notes but never occur.
- `duration` 1–255 in ticks. **`duration 0` ends the stream**; the voice goes idle. Music mostly uses multiples of 12 ticks (0.2 s) or 10 ticks.

Pitch: `block = note / 12`, `F-number = table[note % 12] + detune`. The table starts at 512,
which on an OPL2 (49,716 Hz clock) is 388.4 Hz in block 4, so note 48 sounds as G4 and the
whole scale is 16 cents flat of A440. In MIDI terms **note n ≈ MIDI n + 19**. The lowest used
note (1) is G#0 (26 Hz) and the highest (83) is F#7 (2.9 kHz).

A new note keys the voice off `release` ticks before its duration ends (see `FB`), so with
`release 0` the key-off and the next key-on fall in the same tick, in that order. With
`release 255` the key-on bit is never cleared and the OPL2 does not retrigger the envelope:
that is how legato lines are written.

### 4.2 Commands

| Bytes | Name | Effect |
| --- | --- | --- |
| `FF 00` | loop start | remember the position after this command as the loop-1 start |
| `FF n` | loop | jump back to the loop-1 start and play the section **n more times** (n+1 in total). The counter is a sign-extended byte kept in a word, so `FF 80`–`FF FF` mean 32,769–65,535 repeats, i.e. until the game stops the sound. After the loop ends the loop start moves to the position after this command |
| `FE 00`, `FE n` | outer loop | the same with a second counter and start position. Jumping back with `FE` also resets the loop-1 start to the loop-2 start |
| `FD` | restart | back to the first byte of the stream. Slide, fade, pan slide, volume, volume offset, release, detune, pan (to 64) and both loop counters are reset; the instrument and the current note are not. Parsing continues immediately |
| `FC n` | instrument | load patch n (0–56) into the voice's two operators (§5) and key the voice off |
| `FB n` | release | key off n ticks before the end of each note (0 = at the end, 255 = never) |
| `FA n` | pitch slide | every tick add signed n to the 13-bit block:F-number word of the sounding note (0 stops). Used with ±2, ±3 and −1 |
| `F9 n` | volume | loudness = n / 2 (arithmetic shift; n is meant to be 0–127, values up to 134 occur and clamp to 63) |
| `F8 p d` | fade | every p ticks add signed d to the volume offset. When the offset falls to 0 or below the fade stops and the voice is muted (volume and offset both 0); when it reaches 63 it stops at 63. `F8 00 00` cancels a fade |
| `F7 n` | detune | signed n added to the F-number of each following note (only 6 and 10 occur) |
| `F6 n c1 … cn o` | random | pick one of the n bytes (n a power of two) and store it into the stream o bytes (signed) after the end of this command. **No Civilization stream uses it**; the randomised effects are patched by the ID handlers instead |
| `F5 n` | volume offset | set the fade position directly. Loudness is `volume + offset`, clamped to 0–63, so many streams use this as their main volume with `F9` left at 0 |
| `F4 n` | pan | 0–127, 64 centre. Only affects dual-OPL2 / Pro AudioSpectrum stereo; a plain AdLib ignores it |
| `F3 p d` | pan slide | every p ticks add signed d to the pan |

Opcode usage across the 231 streams: 8,869 notes, 1,318 rests, `FC` 561, `F9` 583, `F5` 566,
`FB` 535, `F8` 456, `F4` 416, `FF` 318, `FA` 150, `FE` 79, `FD` 71, `F3` 25, `F7` 11, `F6` 0.
160 streams end with `duration 0`, 71 with `FD`.

### 4.3 What happens on a tick

`SoundWorker` first advances the random number generator, then, unless the lock word is set,
resumes paused music if the war drums have finished, increments the `SoundTimer` count, and
ticks voices 0 to 8 in order. For one voice:

1. If the voice is idle (ticks-left = 0) nothing happens.
2. If a key-off is pending, count it down; at zero, key off.
3. Count down ticks-left. If it is still non-zero skip to step 5.
4. Otherwise read the stream: run commands until a note is reached (a `restart` keeps
   reading, so the first note of the repeat starts this same tick), then take the note:
   store it, set ticks-left to its duration, set the key-off countdown to `duration − release`
   (mod 256), and key on. A rest, or a duration of 0, keys off instead.
5. If a pitch slide is set, apply it.
6. If a fade or pan slide is running, count it down and apply its step when due, then
   rewrite the volume register.

After all voices, `SoundWorker` steps the two noise slots (§5.2) and decides whether the game
should start or stop calling `FastSoundWorker`.

### 4.4 Voice state

For readers of the disassembly, the 30-byte per-voice block:

| Offset | Field |
| --- | --- |
| 0 | ticks left in the current note; 0 = idle |
| 1 | pitch slide per tick (`FA`) |
| 2 | fade delta (`F8`) |
| 3 | pan slide delta (`F3`) |
| 4 | current note |
| 5 | current instrument |
| 6 | volume 0–63 (`F9`) |
| 7 | release (`FB`) |
| 8 | ticks until key-off |
| 9, 0xA | fade counter, fade period |
| 0xB, 0xC | pan slide counter, period |
| 0xD | pan (`F4`), 64 at start |
| 0xE | stream start (written, never read) |
| 0x10 | read position |
| 0x12, 0x14 | loop-1 and loop-2 start |
| 0x16, 0x18 | loop-1 and loop-2 counters (words) |
| 0x1A | restart address (`FD`) |
| 0x1C | detune (`F7`) |
| 0x1D | volume offset (`F5`, fades) |

`start_voice` sets the four position fields to the stream, the fade period to 255, pan to 64,
everything else to 0 and ticks-left to 1, so the stream is read on the next tick. Fields 4, 5,
8 and 0xC are left over from the previous sound.

### 4.5 Volume

Loudness `L = clamp(volume + offset, 0, 63)`. The carrier's level register (`0x40 + op`) is
written as `(63 − L) | (its current KSL bits)`. The modulator's level comes from the patch and
is never touched by the stream, so `F9`/`F5` only change the carrier, which for FM patches is
the overall volume and for additive patches only one of the two partials.

The register is rewritten at every key-on, after every fade or pan-slide step, and before a
note when a `F9`, `F5` or `F4` command comes *immediately* before it (see §7 for the flag
behind this).

On stereo cards (`mode ≥ 2`) the pan value indexes the 128-byte curve at DS `0x7328` for
each of the two chips (`curve[pan]` for one, `curve[127 − pan]` for the other) and the
result is subtracted from L before writing each chip. Mono cards skip all of this.

### 4.6 Frequency registers

Key-on writes `A0+v = F & 0xFF` and `B0+v = (current key bit) | block << 2 | F >> 8`, then
`B0+v` again with the key bit set. Key-off clears bit 5 of `B0+v` using the shadow copy. A
pitch slide reads the shadow `B0`/`A0`, adds the signed step to the combined 13-bit value
and writes both back, so a slide that crosses an F-number boundary jumps by a whole block.

## 5. Instruments

57 patches of 44 bytes at DS `0x695A`, patch n at `0x695A + 44 n`. Each is two 22-byte
operator records, modulator first, carrier second:

| Byte | Field | Register |
| --- | --- | --- |
| 0 | attack rate | `0x60+op` high nibble |
| 1 | decay rate | `0x60+op` low nibble |
| 2 | sustain level | `0x80+op` high nibble |
| 3 | release rate | `0x80+op` low nibble |
| 4 | sustaining envelope (EG type) | `0x20+op` bit 5 |
| 5 | key scale rate | `0x20+op` bit 4 |
| 6 | output level, 0–63, **63 = loudest** | `0x40+op` = `63 − level` |
| 7 | key scale level | `0x40+op` bits 6–7 |
| 8 | waveform 0–3 | `0xE0+op` |
| 9 | frequency multiplier | `0x20+op` bits 0–3 |
| 0xA | feedback | `0xC0+voice` bits 1–3 |
| 0xB | tremolo | `0x20+op` bit 7 |
| 0xC | vibrato | `0x20+op` bit 6 |
| 0xD | 1 = FM, 0 = additive | `0xC0+voice` bit 0 (inverted) |
| 0xE | pitch-sweep length in ticks (modulator record only) | – |
| 0xF | unused | – |
| 0x10 | word: sweep random mask | – |
| 0x12 | word: sweep start value | – |
| 0x14 | word: sweep step per tick | – |

Loading a patch keys the voice off and writes, for each operator in turn: `0x40+op = 0x3F`
(silence), `0xBD = 0xC0` (deep tremolo and vibrato; the rhythm bits come from an unused
variable that is 0), `0x08 = 0x40` (note select), `0xC0+voice`, `0x60+op`, `0x80+op`,
`0x20+op`, `0xE0+op`, `0x40+op`. Both records carry feedback/connection bytes and both are
written to `0xC0+voice`, so the carrier's copy is what takes effect. The carrier's level byte
is overwritten by the stream's volume at the next key-on.

56 of the 57 patches are used (40 is not). The patches used by each sound are listed in the
reverse-engineering notes.

### 5.1 Pitch-sweep ("noise") instruments

Patches 36, 37 and 40 have a non-zero byte `0xE` (110, 255 and 200 ticks). A key-on with
such an instrument does not set a frequency. Instead it claims one of two "sweep slots"
(they alternate; a voice that already owns a slot keeps it) and loads the slot with the
patch's length, mask, start and step; `SoundWorker` then returns 1 to ask for
`FastSoundWorker`.

- `FastSoundWorker` (300 Hz): advance the RNG; for each active slot write
  `A0`/`B0` of its voice with `start + (rand & mask)` and the key bit set. Slot A uses the
  complement of the random word, slot B the word itself.
- `SoundWorker` (60 Hz), after the voices: for each active slot, `start += step`, count the
  length down, and at zero write `A0 = 0` and `B0 = 0` for its voice (unless the other slot
  still owns the same voice). When both slots are idle it returns `0xFFFF` once.

The three patches: 36 `mask 0x3FF, start 0, step 0` (110 ticks), 37 the same for 255 ticks,
40 `mask 0x999, start 0x333, step 0` (200 ticks). They give the battle explosions, the
nuclear blast and the bomber their noise. With mask `0x3FF` and start 0 the block bits are
always 0, so the noise lives in the lowest octave.

## 6. Random numbers

One 16-bit state, seeded `0x04D2` in the file, advanced on every `SoundWorker` and
`FastSoundWorker` call, by `F6`, and by the handlers of IDs 38, 39 and 44:

```
state = ror16((state + 0x9248) & 0xFFFF, 3)
```

Because it advances at 60 Hz whether or not anything is playing, the variants a player hears
are effectively random.

## 7. Quirks and bugs in the original

- **Uninitialised volume flag.** The "volume changed, rewrite the register before the note"
  flag is a stack local in `tick_voice`. It is cleared when each command byte is read and set
  by `F9`/`F5`/`F4`, so it only counts when the volume command is the *last* command before
  the note. For a note with no command in front it holds whatever the previous voice tick
  left there. Harmless (it re-writes the current volume), but a faithful re-implementation
  has to carry it over between voices to match the register stream byte for byte.
- **Second sweep slot tests the wrong counter.** When a noise instrument takes slot B while
  slot A is busy, the driver keys off the voice slot B *previously* held instead of checking
  slot B's own counter. On the first use that is voice 0. Audible only as a cut-off note on
  voice 0 during the nuclear explosion, if voice 0 was playing.
- **War drums leave carriers muted.** Music voices paused by ID 33 resume with their level
  registers still at silent; each recovers on its next note.
- **Sounds overwrite voices, not tunes.** An effect replaces only the voices it uses; the
  other voices of the current tune carry on, and the replaced voice is not given back.
- **The scale is 16 cents flat** relative to A440 and starts at G, see §4.1.
- `Init`'s argument is stored and never read. The word at image `+0x2E` is unread by the
  driver.

## 8. Reproducing the sounds elsewhere

For a faithful result run the interpreter above against the player's own `ASOUND.CVL` and
feed the register writes to an OPL2 emulator at 60 Hz (plus 300 Hz while a sweep slot is
active). [`tools/asound-cvl/sim.py`](../tools/asound-cvl/sim.py) is a complete reference,
about 400 lines, that produces the same register stream as the original for every ID.

For a MIDI or MIDI-like player the mapping used by [`tools/asound-cvl/export.py`](../tools/asound-cvl/export.py):

- one tick = 1/60 s (the exporter uses 60 PPQ at 60 BPM so MIDI ticks equal driver ticks);
- one MIDI channel per voice; MIDI note = stream note + 19; a global −16 cent tuning offset if wanted;
- velocity from loudness (`L·2+1`), mid-note fades as expression (CC 11);
- `FA` slides and `F7` detune as pitch bend (the exporter declares a ±12 semitone range);
- `FB 255` legato: consecutive notes of the same pitch are tied, different pitches have to retrigger;
- sweep instruments have no MIDI equivalent; the exporter substitutes GM program 127 (Gunshot);
- loop points: voices with `FD` or `FF 80+` loop independently, so the exporter reports each
  voice's first restart tick and cuts the file at the latest one.

The OPL patches cannot be expressed in General MIDI. `export.py` writes them into
`asound.json` next to the decoded events so a web player can drive an OPL emulator or a
WebAudio FM approximation instead.
