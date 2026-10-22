"""Statistics over every stream reachable from the tune table: opcode usage, note range, oddities."""
import collections, os
from cvl import Image, parse_stream
from sim import TUNES, ID33_STREAMS, FADE_STREAM

PATH = os.environ['CVL']
im = Image(PATH)

streams = set([FADE_STREAM, 0x68fa, 0x6900, 0x6906, 0x690c, 0x6898, 0x688c, 0x68a4] + ID33_STREAMS)
for sid, t in TUNES.items():
    if t and isinstance(t[0], list):
        for arr in t:
            streams.update(s for _, s in arr)
    else:
        streams.update(s for _, s in t)

ops = collections.Counter()
instr = collections.Counter()
notes = []
durs = collections.Counter()
weird = []
ends = collections.Counter()
lengths = {}
vols = collections.Counter(); rel = collections.Counter(); slides = collections.Counter(); det = collections.Counter()
fades = collections.Counter(); pans = collections.Counter()
for s in sorted(streams):
    evs = parse_stream(im, s, limit=6000)
    lengths[s] = (evs[-1][0] + (2 if evs[-1][1] in ('NOTE', 'REST') else 1 + len(evs[-1][2]) if evs[-1][1] != 'RANDOM' else evs[-1][2][0] + 3)) - s
    ends[evs[-1][1] if evs[-1][1] != 'REST' else 'END'] += 1
    for a, name, args in evs:
        ops[name] += 1
        if name == 'NOTE':
            notes.append(args[0]); durs[args[1]] += 1
            if args[0] >= 0x80: weird.append((hex(s), hex(a), args))
        elif name == 'REST':
            durs[args[1]] += 1
        elif name == 'INSTR': instr[args[0]] += 1
        elif name == 'VOLUME': vols[args[0]] += 1
        elif name == 'RELEASE': rel[args[0]] += 1
        elif name == 'SLIDE': slides[args[0]] += 1
        elif name == 'DETUNE': det[args[0]] += 1
        elif name == 'FADE': fades[tuple(args)] += 1
        elif name in ('PAN', 'VOLOFS', 'PANSLIDE'): pans[(name, tuple(args))] += 1
print('streams:', len(streams), 'total bytes:', sum(lengths.values()))
print('lowest stream', hex(min(streams)), 'highest end', hex(max(s + l for s, l in lengths.items())))
print('ops:', dict(ops))
print('stream endings:', dict(ends))
print('note range:', min(notes), max(notes), 'weird notes:', weird)
print('durations:', sorted(durs.items()))
print('instruments used:', sorted(instr.items()))
print('volumes:', sorted(vols.items()))
print('release:', sorted(rel.items()))
print('slides:', sorted(slides.items()))
print('detune:', sorted(det.items()))
print('fades:', sorted(fades.items()))
print('pan/volofs:', sorted(pans.items()))
