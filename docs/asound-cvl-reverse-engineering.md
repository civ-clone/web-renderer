# Reverse engineering `ASOUND.CVL` (issue #126)

Working notes on how the Civilization AdLib driver was decoded, what was verified and how,
and what is left. The resulting format description is
[`asound-cvl-format.md`](./asound-cvl-format.md); the scripts are in
[`../tools/asound-cvl/`](../tools/asound-cvl/).

## Status (2026-09-28)

- The music bytecode, the instrument table, the driver's tick model and every `PlayTune`
  handler are decoded.
- A Python re-implementation (`sim.py`) produces **exactly the same OPL2 register writes as
  the original driver, tick for tick, for all 45 sound IDs over 200 seconds each** (the
  original was run under the unicorn CPU emulator for comparison). Two behaviours had to be
  copied from the original to get there: an uninitialised flag and a slot-selection bug, both
  described in the format document.
- All 42 playable IDs were exported to Standard MIDI Files and to one JSON file with the
  decoded events and the FM patches, and several were rendered to WAV through an OPL2
  emulator to confirm they are recognisable.
- Nothing has been listened to critically against the real game yet, and no other driver
  (`RSOUND`, `TSOUND`, `ISOUND`) has been looked at.

## Approach

1. **Start from what was known.** OpenCivOne's `CVL and EXE driver overlays.txt` gives the
   overlay layout (function table at image `+0x30`, data segment word at `+0x2A`) and CivPlay
   shows how the game drives the six entry points and at what rate (PIT at 300 Hz,
   `SoundWorker` every fifth interrupt). The GitHub issue already listed the IDs and their
   call sites.
2. **Run the real thing.** `emu.py` loads the MZ image into unicorn (16-bit x86), applies the
   relocations, and calls the far functions with a fake stack; `IN`/`OUT` hooks record every
   OPL write and answer the AdLib detection handshake. This gives ground truth for any ID
   without understanding anything.
3. **Disassemble with capstone** (`x86dis.py`) and read the code. The driver is compiled C
   with a recognisable per-voice interpreter (`tick_voice`, image `0x07F4`): a `switch` on
   bytes `0xF3`–`0xFF`, note/duration pairs otherwise, and a 30-byte state block per voice.
   The entry stubs, the reset routine and the patch loader identify the data tables.
4. **Emulate `PlayTune` for every ID** (`dump_tunes.py`) and read the nine voice blocks
   afterwards, plus a memory-write hook on the data area. That yields the voice → stream table
   and shows which handlers patch bytes into the streams (the randomised effects), without
   reading forty near-identical handlers by hand.
5. **Write the decoder and the simulator** (`cvl.py`, `sim.py`) from the disassembly, then
   **diff the register streams** (`compare.py`) against unicorn. Each mismatch pointed at a
   misread detail; the last two were genuine quirks of the original.
6. **Export** (`export.py`) and **render** (`render.py`) to check the result is music.

## Tools

All in `tools/asound-cvl/`. They need Python 3 with `capstone`, `unicorn` and `mido`
(`pip install -r requirements.txt`); `render.py` additionally needs `pyopl`, which is GPL and
is only used here for listening, not shipped. Set `CVL=/path/to/ASOUND.CVL` or pass the path.

| Script | Purpose |
| --- | --- |
| `cvl.py` | Load the image, tables and patches; parse and pretty-print a stream: `python cvl.py ASOUND.CVL 4aa8` |
| `sim.py` | The reference re-implementation of the driver (register writes plus a high-level event log) |
| `emu.py` | Unicorn harness for the original driver |
| `x86dis.py` | Capstone disassembly of a range of the image |
| `dump_tunes.py` | Voice → stream table for every ID from the emulated original |
| `compare.py` | Register-stream diff between `sim.py` and the emulated original: `python compare.py 12000` (ticks) `[ids] [levels]` |
| `stats.py` | Opcode, note and instrument statistics over all streams |
| `export.py` | Write `civ1-NN-name.mid` for every sound and `asound.json`: `python export.py ASOUND.CVL outdir` |
| `render.py` | Render one ID to WAV through pyopl: `python render.py ASOUND.CVL 3 out.wav 45` |

## Verification

`compare.py 12000` (200 s at 60 Hz, `FastSoundWorker` five times per tick when requested)
reports `OK` for IDs 0–44. The write sequences, including their tick numbers and the noise
slots' 300 Hz writes, are identical; the number of register writes compared per ID:

```
id  0: 240    id  1: 0      id  2: 0      id  3: 8021   id  4: 17936  id  5: 13296
id  6: 17394  id  7: 16803  id  8: 29923  id  9: 17501  id 10: 25429  id 11: 10761
id 12: 22959  id 13: 2885   id 14: 3074   id 15: 15603  id 16: 19072  id 17: 43003
id 18: 14494  id 19: 307    id 20: 245    id 21: 290    id 22: 674    id 23: 424
id 24: 405    id 25: 464    id 26: 574    id 27: 276    id 28: 499    id 29: 311
id 30: 295    id 31: 492    id 32: 267    id 33: 159    id 34: 8672   id 35: 1788
id 36: 6320   id 37: 30     id 38: 35     id 39: 143    id 40: 1138   id 41: 1247
id 42: 5215   id 43: 2549   id 44: 993
```

Limits of this check: the emulated driver always detects a mono AdLib (mode 0), so the
dual-OPL2 / Pro AudioSpectrum stereo paths (pan) are decoded from the disassembly only. The
game's exact `level` argument for IDs 5–18 and the 70 Hz frame-drop timing are taken from the
issue, not re-derived here.

## What the sounds turned out to be

Lengths are at level 3 and count up to the first repeat; "loops" means at least one voice
restarts or has an endless `FF 80+` loop, so the sound plays until the game stops it.

| ID | Sound | Voices | Length | Loops | Patches used |
| --- | --- | --- | ---: | --- | --- |
| 3 | Main theme | 0–7 | 90 s | yes: voices 1–4 end at 93 s, voices 0 and 7 keep arpeggiating over a bass drone on 5 and 6 | 1,2,3,7,9,12,14,15,19,21,56 |
| 4 | Evolution (world creation) | 0–7 | 147 s | no | 2,3,7,9,15,16,18,19,21,26,56 |
| 5 | Americans | 0–3 | 34 s | yes | 5,27,39 |
| 6 | Aztecs | 0–3 | 28 s | yes, voices loop at 14/16/20/28 s | 28,41,42 |
| 7 | Egyptians | 0–4, 6 | 23 s | yes | 15,27,28,35,43,44 |
| 8 | Zulus | 0–2, 6 | 38 s | yes, voices loop at 13/19/26/38 s | 30,44,45,46 |
| 9 | French | 0–7 | 171 s | no | 2,5,24,26,27,39,56 |
| 10 | Romans | 0–7 | 128 s | yes | 3,5,6,54 |
| 11 | Russians | 0–7 | 53 s | yes | 8,9,15,24,27 |
| 12 | Greeks | 0–7 | 114 s | yes | 10,19,21,28,52,53 |
| 13 | English | 0–4 | 44 s | no | 3,5,7,8,11,25,26,56 |
| 14 | Babylonians | 0–6 | 26 s | no | 0,19,20,42,45,48 |
| 15 | Chinese | 0–6 | 15 s | yes | 47,48,49 |
| 16 | Mongols | 0–7 | 14 s | yes | 29,31,32,34,42,45,51 |
| 17 | Indians | 0–7 | 61 s | yes, drone voices 6 and 7 loop every 3.7 s | 9,17,28,30,44,46,50 |
| 18 | Germans | 0–5 | 96 s | yes, voice 2 every 96 s, the rest every 48 s | 18,20,23,26,27 |
| 19–32 | Short national themes | 4–8 voices | 2.0–6.0 s | no | as their long versions |
| 33 | War drums | 8 | 3.3–4.0 s | no | 55 (six patterns of 240 ticks, the one at `027E` is 200) |
| 34 | Win | 0–7 | 47 s | no | 2,5,7,15,18,19,21,25,56 |
| 35 | Lose | 0–6 | 30 s | no | 7,13,21,22,26 |
| 36 | Civil disorder / Barbarians | 1–6 | 48 s | no | 3,7,16,19,21,56 |
| 37 | Illegal move | 0 | 0.8 s | no | 38 |
| 38 | Battle won | 1 | 1.0 s | no | 31 (three low hits, two pitches random) |
| 39 | Battle lost | 0, 1 | 1.1 s | no | 21 (a slide down), 31 |
| 40 | Battle won, modern | 6 | 1.9 s | no | 36 (explosion) |
| 41 | Battle lost, modern | 2, 3 | 1.9 s | no | 21, 36 |
| 42 | Nuclear explosion | 4, 5 | 4.8 s | no | 14, 37 |
| 43 | Bomber | 0, 1 | 3.5 s | no | 36 twice |
| 44 | City build complete | 0–3 | 4.0 s | no | 16 (four-part canon, random offsets) |

Answers to the issue's open questions:

- **`param2`** is an arrangement level 0–3 for the long national themes; each level adds
  voices and 3 is the full piece. Other IDs ignore it.
- **ID 1** fades everything out over about a second; **ID 2** is a query ("still playing?")
  and makes no sound.
- **Looping**: see the table. Voices loop independently (`FD` restart or `FF 80+`).
- **Overlap**: an effect claims only its own voices; the rest of the music continues, and the
  claimed voices stay silent afterwards. Only the war drums pause and resume the music.
- **Note format**: it is not the MPS format of later MicroProse games; it is a simpler
  per-voice byte stream, described in the format document.

## Exported files

`export.py` writes, for each ID 3–44 (and a `-p0` variant for the 14 long themes):

- `civ1-NN-name.mid`: type-1 SMF, 60 PPQ at 60 BPM so one MIDI tick is one driver tick, one
  track per voice, GM programs guessed from each patch's envelope, expression for fades,
  pitch bend (±12 semitone range) for slides and detune, `loop start`/`loop end` markers.
- `asound.json`: tick rate, the F-number table, all 57 patches with named fields, and per
  sound the streams, loop/end ticks and the event list per voice (`on`, `off`, `level`,
  `freq`, `instr`, `sweep`, `restart`, `loop`, `end`).

The MIDI files are a convenience for listening and for a MIDI-based player. They cannot
carry the FM timbres; a faithful web player should drive an OPL2 emulator from `sim.py`'s
logic (or from `asound.json`'s events plus patches).

## The 1994 General MIDI driver (`GSOUND.CVL`)

MicroProse's April 1994 "new sound drivers" archive (CivFanatics thread *The Civilization
Jukebox*, files `GSOUND.CVL`, `PSOUND.CVL`, `SOUND.EXE`, `CONFIG.SND`) adds an OPL3 driver
and a General MIDI driver with the same 11-function overlay interface. `CONFIG.SND` is 18
bytes written by `SOUND.EXE`; the GM driver reads word 2 as the MPU-401 port and falls back to
`0x330` when the file is missing. It also keeps word 3, whose meaning was not traced (probably
the IRQ).

The GM driver does not need decoding: `gm.py` runs it under unicorn with an MPU-401 stub
(status port answers "ready", data port answers `0xFE`) and records every byte written to
the data port with its tick. `gm_export.py` parses that stream (running status, sysex,
system-common bytes) into a type-1 SMF per sound, one track per MIDI channel, 60 PPQ at
60 BPM, cut at the AdLib export's loop point for looping tunes. Non-looping files end about
two seconds after the last event, because the capture waits for that much quiet. Findings:

- At `Init` the driver sends, for MIDI channels 10 down to 1: all notes off, reset controllers,
  volume 100, pan 64, reverb 0, chorus 0 and a pitch-bend range of 2 semitones.
- The pieces are the same compositions on the same 60 Hz tick: for the American theme the
  set of note-on ticks in the first 700 ticks is identical. The GM note numbers equal the
  AdLib stream notes plus 19, which confirms the pitch mapping in the format document
  independently.
- They are re-scored, though, and not always the same length. Evolution has 2,001 note-ons
  against the AdLib version's 2,721 with the same final tick (8,796), and the English theme
  has 635 against 554 and ends about six seconds earlier (last note-on at tick 2,180
  against 2,554). Only the American theme was compared tick by tick, so cutting looping GM
  tunes at the AdLib loop point is an assumption that still needs checking per tune.
- The GM arrangement is its own: different channel allocation, GM program numbers, per-note
  velocities and volume fades sent as CC 7. This is the best source for a MIDI-based player;
  the AdLib data remains the best source for the original sound.
- Sounds with random elements (38, 39, 44) differ between drivers and between runs because
  each driver's RNG state depends on how many ticks have elapsed.

GM program numbers the driver selects (0-based `program_change` values, MIDI channel in
brackets). The distinct programs are 1 Bright Piano, 7 Clavinet, 10 Music Box, 12 Marimba,
24 Nylon Guitar, 40 Violin, 43 Contrabass, 45 Pizzicato Strings, 46 Harp, 47 Timpani,
48 Strings, 56 Trumpet, 57 Trombone, 58 Tuba, 60 French Horn, 63 Synth Brass 2, 64 Soprano
Sax, 68 Oboe, 69 English Horn, 70 Bassoon, 71 Clarinet, 73 Flute, 82 Calliope Lead, 104 Sitar,
107 Koto, 113 Agogo, 115 Woodblock, 116 Taiko, 117 Melodic Tom, 118 Synth Drum, 119 Reverse
Cymbal, 127 Gunshot.

| ID | Programs (channel) |
| --- | --- |
| 3 Main theme | 1, 46, 48, 71, 73 (2); 60 (3); 48, 60 (4, 5); 47 (6) |
| 4 Evolution | 45, 46, 60, 71, 73 (2); 45, 60, 73 (3); 45, 48, 71, 73 (4); 45, 48 (5); 47, 48 (6) |
| 5 / 19 Americans | 63 (2); 60 (3); 57 (4); 63 (5) |
| 6 / 20 Aztecs | 82 (2); 117 (3–5) |
| 7 Egyptians | 82 (2); 46 (3); 10 (5). Short: adds 7, 10, 45 (1) and 7, 10, 47 (11) |
| 8 / 22 Zulus | 113 (2); 115 (3); 117 (4) |
| 9 French | 57, 60 (2, 3); 57, 63 (4); 58 (5); 47 (6). Short: 57 (2–4); 58 (5); 47 (6) |
| 10 / 24 Romans | 63 (2–6) |
| 11 Russians | 45, 48 (2, 3, 6); 48 (4); 40, 48 (5). Short: 48 (2, 4, 5); 40 (3); 43 (6) |
| 12 / 26 Greeks | 82 (2); 73 (3); 24 (4); 1 (5, 6); 45, 71 (7) |
| 13 English | 48, 56 (2); 48, 71 (3); 48, 60 (4); 48 (5); 47 (6). Short: 60 (2–5); 47 (6) |
| 14 / 28 Babylonians | 82 (2, 4); 64 (3); 24 (5) |
| 15 / 29 Chinese | 82 (2, 4); 12 (3, 5); 107 (6) |
| 16 / 30 Mongols | 47 (2); 127 (3); 118 (4); 115 (5) |
| 17 Indians | 82 (2); 104 (3, 5); 40 (4). Short: 40 (2); 104 (3) |
| 18 Germans | 48, 60, 68 (2, 3); 48, 56, 69 (4); 56, 58, 70 (5); 48, 58, 70 (6); 56 (7). Short: 56 (2–6) |
| 33 War drums | 47 (2, 3) |
| 34 Win | 63 (2); 48, 60, 63, 71, 73 (3, 5); 48 (4); 45 (6); 47 (7) |
| 35 Lose | 48 (2–6) |
| 36 Civil disorder | 48, 60, 71, 73 (2); 47, 48 (3); 45, 48 (4); 48 (5) |
| 37 Illegal move | 71 (7) |
| 38 / 39 Battle won / lost | 119 (7); 39 adds 71 (7) |
| 40 / 41 Modern battle | 47 (2, 3); 116 (4) / 47, 71 (2); 47 (3) |
| 42 Nuclear explosion, 43 Bomber | 47 (2, 3) |
| 44 City build complete | 45 (2–5) |

## Suggested next steps for the renderer

1. Port `sim.py` to TypeScript in `@civ-clone/civ1-asset-extractor` (about 400 lines; the
   Python is written to be ported line by line and `compare.py`-style tests can be reproduced
   by checking the TS port against the JSON export's event list or a captured register stream).
2. Turn the register writes into sound in an `AudioWorklet`, calling the port at 60 Hz plus
   300 Hz while a noise slot is active. The issue (#126) settles on a small OPL2 synth written
   for this project and lists what it has to support; ymfm (BSD-3) is the off-the-shelf
   alternative.
3. Map engine events to IDs using the table in the issue, pass level 3 for national themes,
   and use `PlayTune(1)` semantics (fade) when dialogs close.
4. Optionally decode `TSOUND.CVL` and `ISOUND.CVL` the same way; the overlay layout is the
   same and the streams are probably shared.

## Sources

- OpenCivOne, `src/Documentation/CVL and EXE driver overlays.txt`, `GameData.cs`: <https://codeberg.org/rhorvat/OpenCivOne>
- CivPlay (`CIVPLAY.C`): <https://github.com/rajko-horvat/CivPlay>
- The GitHub issue for this work: dom111/web-renderer#126
- Tools: unicorn <https://www.unicorn-engine.org/>, capstone <https://www.capstone-engine.org/>, mido, pyopl (DOSBox DBOPL)
