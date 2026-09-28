# ASOUND.CVL tooling

Reference decoder, simulator and exporters for Civilization's AdLib sound driver. What the
format is: [`../../docs/asound-cvl-format.md`](../../docs/asound-cvl-format.md). How it was
worked out and what each script is for:
[`../../docs/asound-cvl-reverse-engineering.md`](../../docs/asound-cvl-reverse-engineering.md).

None of the original game data is in this repository; every script takes the player's own
`ASOUND.CVL`.

```bash
python3 -m venv venv && ./venv/bin/pip install -r requirements.txt
export CVL=/path/to/ASOUND.CVL

./venv/bin/python cvl.py "$CVL" 4aa8          # print one stream (main theme, voice 0)
./venv/bin/python compare.py 2400             # sim.py vs the real driver under unicorn, all IDs
./venv/bin/python export.py "$CVL" out        # 56 .mid files + asound.json
./venv/bin/pip install pyopl && ./venv/bin/python render.py "$CVL" 3 main-theme.wav 45
```

The 1994 General MIDI driver (`GSOUND.CVL`, from the CivFanatics "additional sound drivers"
archive) is captured rather than decoded: `gm.py` runs it under unicorn with an MPU-401 stub
and `gm_export.py` turns the bytes it sends into one SMF per sound, cut at the AdLib loop
points when `asound.json` is given:

```bash
./venv/bin/python gm_export.py /path/to/GSOUND.CVL gm-out out/asound.json
```

`sim.py` is the piece to port to TypeScript for playback in the renderer: `Driver.play(id,
level)`, `sound_worker()` at 60 Hz and `fast_worker()` at 300 Hz while `sound_worker()` last
returned 1, collecting `(tick, register, value)` for an OPL2 emulator.
