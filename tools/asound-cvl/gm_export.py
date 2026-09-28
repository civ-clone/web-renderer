"""Capture every sound from GSOUND.CVL (General MIDI driver, MicroProse 1994) as a Standard MIDI
File by running the driver under unicorn and recording the bytes it writes to the MPU-401.

    python gm_export.py GSOUND.CVL outdir [asound.json]

If asound.json (from export.py) is given, its per-ID lengths are used to cut looping tunes at the
same point as the AdLib export; otherwise looping tunes are cut after 5 minutes.
"""
import json, os, sys
import mido
from gm import GM

NAMES = {
    3: 'Main theme', 4: 'Evolution', 5: 'Americans', 6: 'Aztecs', 7: 'Egyptians', 8: 'Zulus', 9: 'French',
    10: 'Romans', 11: 'Russians', 12: 'Greeks', 13: 'English', 14: 'Babylonians', 15: 'Chinese', 16: 'Mongols',
    17: 'Indians', 18: 'Germans', 33: 'War drums', 34: 'Win', 35: 'Lose', 36: 'Civil disorder',
    37: 'Illegal move', 38: 'Battle won', 39: 'Battle lost', 40: 'Battle won modern', 41: 'Battle lost modern',
    42: 'Nuclear explosion', 43: 'Bomber', 44: 'City build complete',
}
for i in range(19, 33):
    NAMES[i] = NAMES[i - 14] + ' short'

LEN = {0xc: 2, 0xd: 2, 0x8: 3, 0x9: 3, 0xa: 3, 0xb: 3, 0xe: 3}
SYSCOMMON = []


def parse(stream):
    """(tick, byte) list -> list of (tick, mido.Message), honouring running status and sysex."""
    out = []
    status = None; buf = []; need = 0; t0 = 0
    i = 0
    while i < len(stream):
        t, b = stream[i]; i += 1
        if b == 0xf0:
            j = i
            while j < len(stream) and stream[j][1] != 0xf7: j += 1
            data = [x for _, x in stream[i:j]]
            out.append((t, mido.Message('sysex', data=data)))
            i = j + 1
            status = None
            continue
        if b >= 0xf8:
            continue
        if 0xf1 <= b <= 0xf7:                       # system common: skip with its data bytes
            i += {0xf1: 1, 0xf2: 2, 0xf3: 1}.get(b, 0)
            status = None
            SYSCOMMON.append((t, b))
            continue
        if b & 0x80:
            status = b; buf = []; need = LEN[b >> 4] - 1; t0 = t
            continue
        if status is None:
            continue
        if not buf: t0 = t
        buf.append(b)
        if len(buf) == need:
            out.append((t0, mido.Message.from_bytes([status] + buf)))
            buf = []
    return out


def capture(path, sid, max_ticks, param=3, quiet_ticks=120):
    d = GM(path)
    d.call(0, 0)
    init = list(d.midi); d.midi = []
    d.call(1, sid, param)
    fast = False
    last_active = 0
    for t in range(max_ticks):
        d.t = t
        for k in range(5):
            if fast: d.call(4)
            if k == 4:
                r = d.call(3)
                if r == 1: fast = True
                elif r == 0xffff: fast = False
        if d.midi and d.midi[-1][0] == t:
            last_active = t
        if d.call(1, 2) == 0 and t - last_active > quiet_ticks:      # PlayTune(2): still playing?
            break
    return init, d.midi, t


def write_smf(msgs, fn, title, end_tick, loop):
    mid = mido.MidiFile(type=1, ticks_per_beat=60)
    meta = mido.MidiTrack(); mid.tracks.append(meta)
    meta.append(mido.MetaMessage('track_name', name=title, time=0))
    meta.append(mido.MetaMessage('set_tempo', tempo=1_000_000, time=0))
    meta.append(mido.MetaMessage('text', text='Captured from GSOUND.CVL (Civilization GM driver, MicroProse 1994). '
                                 '1 tick = 1/60 s.', time=0))
    if loop:
        meta.append(mido.MetaMessage('marker', text='loop end', time=end_tick))
    chans = sorted(set(m.channel for _, m in msgs if hasattr(m, 'channel')))
    for ch in chans:
        tr = mido.MidiTrack(); mid.tracks.append(tr)
        tr.append(mido.MetaMessage('track_name', name=f'channel {ch + 1}', time=0))
        last = 0
        for t, m in msgs:
            if getattr(m, 'channel', None) != ch or t > end_tick: continue
            m = m.copy(time=t - last); last = t
            tr.append(m)
        # silence anything still sounding at the cut
        tr.append(mido.Message('control_change', channel=ch, control=123, value=0, time=max(0, end_tick - last)))
    mid.save(fn)


if __name__ == '__main__':
    path, outdir = sys.argv[1], sys.argv[2]
    os.makedirs(outdir, exist_ok=True)
    adlib = {}
    if len(sys.argv) > 3:
        for s in json.load(open(sys.argv[3]))['sounds']:
            if s['param'] == 3: adlib[s['id']] = s
    summary = {}
    for sid in range(3, 45):
        a = adlib.get(sid)
        max_ticks = (a['length_ticks'] + 1 if a and a['loops'] else 18000)
        init, stream, last_tick = capture(path, sid, max_ticks)
        msgs = parse(stream)
        loop = bool(a and a['loops'])
        end_tick = a['length_ticks'] if loop else last_tick
        progs = sorted(set((m.channel + 1, m.program) for _, m in msgs if m.type == 'program_change'))
        notes = [(t, m.channel, m.note) for t, m in msgs if m.type == 'note_on' and m.velocity]
        slug = NAMES[sid].lower().replace(' ', '-')
        fn = os.path.join(outdir, f'civ1-gm-{sid:02d}-{slug}.mid')
        write_smf(msgs, fn, f'Civ1 GM sound {sid}: {NAMES[sid]}', end_tick, loop)
        summary[sid] = {'name': NAMES[sid], 'file': os.path.basename(fn), 'length_ticks': end_tick,
                        'loops': loop, 'programs': progs, 'note_ons': len(notes),
                        'first_note_ticks': [t for t, _, _ in notes[:12]]}
        print(f"id {sid:2d} {NAMES[sid]:22s} {end_tick/60:6.1f}s notes {len(notes):5d} programs {progs}", flush=True)
    json.dump({'init_bytes': [b for _, b in init], 'sounds': summary}, open(os.path.join(outdir, 'gsound.json'), 'w'), indent=1)
