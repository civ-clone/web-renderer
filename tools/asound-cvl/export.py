"""Export every sound in ASOUND.CVL as a Standard MIDI File plus one JSON file with the decoded
events and the OPL2 instrument patches.

    python export.py ASOUND.CVL outdir

MIDI timing: 60 ticks per beat at 60 beats per minute, so one MIDI tick is one driver tick (1/60 s).
"""
import json, math, os, sys
import mido
from cvl import Image, MIDI_OFFSET, PATCH_TABLE, PATCH_SIZE
from sim import Driver, TUNES

NAMES = {
    3: 'Main theme', 4: 'Evolution (world creation)',
    5: 'Americans', 6: 'Aztecs', 7: 'Egyptians', 8: 'Zulus', 9: 'French', 10: 'Romans', 11: 'Russians',
    12: 'Greeks', 13: 'English', 14: 'Babylonians', 15: 'Chinese', 16: 'Mongols', 17: 'Indians', 18: 'Germans',
    33: 'War drums (prepare for war)', 34: 'Win', 35: 'Lose', 36: 'Civil disorder / Barbarians',
    37: 'Illegal move', 38: 'Battle won', 39: 'Battle lost', 40: 'Battle won (modern)', 41: 'Battle lost (modern)',
    42: 'Nuclear explosion', 43: 'Bomber', 44: 'City build complete',
}
for i in range(19, 33):
    NAMES[i] = NAMES[i - 14] + ' (short)'

OPL_CLOCK = 49716.0


def opl_hz(block, fnum):
    return fnum * OPL_CLOCK / (1 << (20 - block))


def gm_program(im, patch):
    """A rough General MIDI stand-in for an OPL patch, chosen from its envelope.  The JSON carries the
    real FM parameters; this only makes the .mid files listenable."""
    op1, op2 = im.patch(patch)
    if op1[0xe]:
        return 127                                  # gunshot: pitch-sweep noise
    attack, decay, sustain, release, eg = op2[0], op2[1], op2[2], op2[3], op2[4]
    mult = op2[9]
    if eg and sustain <= 3:                          # sustained, full level
        return 48 if attack < 10 else 19             # strings / church organ
    if eg:
        return 40 if attack < 10 else 73             # violin / flute
    if decay >= 8 and release >= 6:
        return 12 if mult >= 2 else 0               # marimba-ish / piano
    if decay >= 5:
        return 24                                    # nylon guitar (pluck)
    return 11                                        # vibraphone (bell-like)


def cents(hz, ref):
    return 1200.0 * math.log2(hz / ref) if hz > 0 and ref > 0 else 0.0


def nominal_hz(im, note, detune=0):
    return opl_hz(note // 12, im.fnum[note % 12] + detune)


def export_tune(path, sid, param, outdir, im, max_ticks=36000):
    d = Driver(path)
    d.reset(); d.writes = []; d.events = []
    d.play(sid, param)
    fast = False
    first_restart = {}
    ended = {}
    cursor = 0
    for _ in range(max_ticks):
        for k in range(5):
            if fast:
                d.fast_worker()
            if k == 4:
                r = d.sound_worker()
                if r == 1: fast = True
                elif r == 0xffff: fast = False
        for e in d.events[cursor:]:
            if e[2] in ('restart', 'loop') and e[1] not in first_restart: first_restart[e[1]] = e[0]
            if e[2] == 'end' and e[1] not in ended: ended[e[1]] = e[0]
        cursor = len(d.events)
        # stop when everything has ended, or once every voice still playing has restarted once
        live = [i for i, V in enumerate(d.voices) if V.dur]
        if not live and d.slot_count == [0, 0]:
            break
        if all(v in first_restart for v in live):
            break
    events = d.events
    loops = bool(first_restart)
    stop_tick = max(first_restart.values()) if loops else d.tick

    # ---- MIDI ----
    mid = mido.MidiFile(type=1, ticks_per_beat=60)
    meta = mido.MidiTrack(); mid.tracks.append(meta)
    meta.append(mido.MetaMessage('track_name', name=f'Civ1 sound {sid}: {NAMES.get(sid, "?")}', time=0))
    meta.append(mido.MetaMessage('set_tempo', tempo=1_000_000, time=0))
    meta.append(mido.MetaMessage('text', text='Decoded from ASOUND.CVL (Civilization, MicroProse 1991). '
                                 '1 tick = 1/60 s. Pitch bend range 12 semitones.', time=0))
    if loops:
        meta.append(mido.MetaMessage('marker', text='loop start', time=0))
        meta.append(mido.MetaMessage('marker', text='loop end', time=stop_tick))
    used = sorted(set(e[1] for e in events if e[2] in ('on', 'sweep')))
    for v in used:
        tr = mido.MidiTrack(); mid.tracks.append(tr)
        ch = v
        msgs = []   # (tick, order, message)
        msgs.append((0, 0, mido.MetaMessage('track_name', name=f'voice {v}')))
        # pitch bend range = 12 semitones
        for cc, val in ((101, 0), (100, 0), (6, 12), (38, 0)):
            msgs.append((0, 0, mido.Message('control_change', channel=ch, control=cc, value=val)))
        cur_note = None; cur_prog = None; cur_level = 0; cur_bend = None; cur_nominal = None
        for e in events:
            t = e[0]
            if e[1] != v or t > stop_tick: continue
            kind = e[2]
            if kind == 'level':
                cur_level = e[3]
                if cur_note is not None:
                    onset = cur_note[2]
                    val = min(127, round(127 * (cur_level + 1) / (onset + 1)))
                    msgs.append((t, 1, mido.Message('control_change', channel=ch, control=11, value=val)))
            elif kind == 'on':
                note, instr, level, detune = e[3], e[4], e[5], e[6]
                prog = gm_program(im, instr)
                if prog != cur_prog:
                    msgs.append((t, 0, mido.Message('program_change', channel=ch, program=prog)))
                    cur_prog = prog
                m = max(0, min(127, note + MIDI_OFFSET))
                if cur_note is not None and cur_note[0] == m and cur_note[3] == detune:
                    continue                                    # legato tie on the same pitch
                if cur_note is not None:
                    msgs.append((t, 1, mido.Message('note_off', channel=ch, note=cur_note[0], velocity=0)))
                msgs.append((t, 2, mido.Message('control_change', channel=ch, control=11, value=127)))
                cur_nominal = nominal_hz(im, note)
                bend = 8192 + int(round(cents(nominal_hz(im, note, detune), cur_nominal) / 1200 * 8192))
                bend = max(0, min(16383, bend))
                if bend != cur_bend:
                    msgs.append((t, 2, mido.Message('pitchwheel', channel=ch, pitch=bend - 8192)))
                    cur_bend = bend
                vel = max(1, min(127, level * 2 + 1))
                msgs.append((t, 3, mido.Message('note_on', channel=ch, note=m, velocity=vel)))
                cur_note = (m, note, level, detune)
            elif kind == 'sweep':
                instr, level = e[3], e[4]
                prog = gm_program(im, instr)
                if prog != cur_prog:
                    msgs.append((t, 0, mido.Message('program_change', channel=ch, program=prog)))
                    cur_prog = prog
                if cur_note is not None:
                    msgs.append((t, 1, mido.Message('note_off', channel=ch, note=cur_note[0], velocity=0)))
                msgs.append((t, 3, mido.Message('note_on', channel=ch, note=36, velocity=max(1, min(127, level * 2 + 1)))))
                cur_note = (36, None, level, 0)
            elif kind == 'off':
                if cur_note is not None:
                    msgs.append((t, 1, mido.Message('note_off', channel=ch, note=cur_note[0], velocity=0)))
                    cur_note = None
            elif kind == 'freq':
                if cur_note is not None and cur_nominal:
                    hz = opl_hz(e[3], e[4])
                    bend = 8192 + int(round(cents(hz, cur_nominal) / 1200 * 8192))
                    bend = max(0, min(16383, bend))
                    if bend != cur_bend:
                        msgs.append((t, 1, mido.Message('pitchwheel', channel=ch, pitch=bend - 8192)))
                        cur_bend = bend
            elif kind in ('end', 'restart', 'loop'):
                if cur_note is not None:
                    msgs.append((t, 1, mido.Message('note_off', channel=ch, note=cur_note[0], velocity=0)))
                    cur_note = None
        if cur_note is not None:
            msgs.append((stop_tick, 1, mido.Message('note_off', channel=ch, note=cur_note[0], velocity=0)))
        msgs.sort(key=lambda x: (x[0], x[1]))
        last = 0
        for t, _, m in msgs:
            m.time = t - last; last = t
            tr.append(m)
        tr.append(mido.MetaMessage('end_of_track', time=max(0, stop_tick - last)))
    slug = NAMES.get(sid, "").split(" (")[0].split(" / ")[0].lower().replace(" ", "-")
    fn = os.path.join(outdir, f'civ1-{sid:02d}-{slug}{"-p%d" % param if 5 <= sid <= 18 and param != 3 else ""}.mid')
    mid.save(fn)

    # ---- JSON ----
    voices = {}
    for v in used:
        voices[v] = [[e[0]] + list(e[2:]) for e in events if e[1] == v and e[0] <= stop_tick]
    return {
        'id': sid, 'name': NAMES.get(sid), 'param': param, 'loops': loops, 'length_ticks': stop_tick,
        'length_seconds': round(stop_tick / 60, 1), 'first_restart_tick': first_restart or None,
        'voice_end_tick': ended or None, 'streams': {v: hex(s) for v, s in _streams(sid, param)},
        'file': os.path.basename(fn), 'voices': voices,
    }


def _streams(sid, param):
    t = TUNES.get(sid)
    if sid == 38: return [(1, 0x6898)]
    if sid == 39: return [(0, 0x68a4), (1, 0x688c)]
    if sid == 44: return [(0, 0x68fa), (1, 0x6900), (2, 0x6906), (3, 0x690c)]
    if sid == 33: return [(8, 0x50)]
    if t and isinstance(t[0], list): t = t[param & 3]
    return t or []


def patches_json(im):
    keys = ['attack', 'decay', 'sustain', 'release', 'eg_sustain', 'ksr', 'level', 'ksl', 'waveform', 'mult',
            'feedback', 'am', 'vibrato', 'fm']
    out = []
    for n in range(57):
        op1, op2 = im.patch(n)
        p = {'id': n, 'modulator': dict(zip(keys, op1[:14])), 'carrier': dict(zip(keys, op2[:14]))}
        if op1[0xe]:
            p['sweep'] = {'ticks': op1[0xe], 'random_mask': int.from_bytes(op1[0x10:0x12], 'little'),
                          'start': int.from_bytes(op1[0x12:0x14], 'little'),
                          'step_per_tick': int.from_bytes(op1[0x14:0x16], 'little')}
        out.append(p)
    return out


if __name__ == '__main__':
    path, outdir = sys.argv[1], sys.argv[2]
    os.makedirs(outdir, exist_ok=True)
    im = Image(path)
    result = {'source': os.path.basename(path), 'tick_hz': 60, 'midi_note_offset': MIDI_OFFSET,
              'fnum_table': list(im.fnum), 'patches': patches_json(im), 'sounds': []}
    for sid in range(3, 45):
        params = [3, 0] if 5 <= sid <= 18 else [3]
        for p in params:
            r = export_tune(path, sid, p, outdir, im)
            print(f"id {sid:2d} p{p} {r['name']:32s} {r['length_seconds']:7.1f}s loops={r['loops']} "
                  f"restarts={r['first_restart_tick']} ends={r['voice_end_tick']} -> {r['file']}", flush=True)
            result['sounds'].append(r)
    with open(os.path.join(outdir, 'asound.json'), 'w') as f:
        json.dump(result, f)
    print('wrote', os.path.join(outdir, 'asound.json'))
