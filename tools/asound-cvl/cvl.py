"""Parser for the MicroProse Civilization (1991) ASOUND.CVL music bytecode."""
import struct

DS_OFF = 0x1e20          # data segment start inside the MZ image
PATCH_TABLE = 0x695a     # DS-relative
PATCH_SIZE = 0x2c

def load_image(path):
    d = open(path, 'rb').read()
    hdr = struct.unpack('<H', d[8:10])[0] * 16
    return d[hdr:]

class Image:
    def __init__(self, path):
        self.img = load_image(path)
        self.ds = self.img[DS_OFF:]
        self.fnum = struct.unpack('<12H', self.ds[0x73a8:0x73a8+24])
        self.pan = list(self.ds[0x7328:0x7328+128])
        self.voice_ops = [tuple(self.ds[0x73c6+2*i:0x73c6+2*i+2]) for i in range(9)]
        self.op_reg = list(self.ds[0x73d8:0x73d8+18])
        self.rng_seed = struct.unpack('<H', self.ds[0x73fd:0x73ff])[0]
    def byte(self, a): return self.ds[a]
    def sbyte(self, a):
        v = self.ds[a]; return v - 256 if v & 0x80 else v
    def word(self, a): return struct.unpack('<H', self.ds[a:a+2])[0]
    def patch(self, n):
        b = PATCH_TABLE + n * PATCH_SIZE
        return [self.ds[b:b+0x16], self.ds[b+0x16:b+0x2c]]

OPS = {
    0xff: ('LOOP1', 1), 0xfe: ('LOOP2', 1), 0xfd: ('RESTART', 0), 0xfc: ('INSTR', 1),
    0xfb: ('RELEASE', 1), 0xfa: ('SLIDE', 1), 0xf9: ('VOLUME', 1), 0xf8: ('FADE', 2),
    0xf7: ('DETUNE', 1), 0xf6: ('RANDOM', None), 0xf5: ('VOLOFS', 1), 0xf4: ('PAN', 1),
    0xf3: ('PANSLIDE', 2),
}

def parse_stream(im, start, limit=None):
    """Linear parse from `start` until the stream terminates (note with duration 0 / RESTART) or
    `limit` bytes.  Returns list of (offset, name, args)."""
    out = []
    a = start
    while True:
        if limit is not None and a - start >= limit: break
        b = im.byte(a)
        if b >= 0xf3:
            name, n = OPS[b]
            if b == 0xf6:
                n = im.byte(a+1)
                choices = list(im.ds[a+2:a+2+n])
                off = im.sbyte(a+2+n)
                out.append((a, name, (n, choices, off)))
                a += n + 3
            else:
                args = list(im.ds[a+1:a+1+n])
                out.append((a, name, args))
                a += 1 + n
                if b == 0xfd:
                    break
        else:
            note, dur = im.byte(a), im.byte(a+1)
            out.append((a, 'NOTE' if note else 'REST', [note, dur]))
            a += 2
            if dur == 0:
                break
    return out

NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
MIDI_OFFSET = 19   # the F-number table starts at G, ~16 cents flat: stream note n sounds like MIDI n+19

def note_name(n):
    m = n + MIDI_OFFSET
    return f"{NOTE_NAMES[m%12]}{m//12 - 1}"

def fmt(ev):
    a, name, args = ev
    if name == 'NOTE':
        return f"{a:04x}: note {args[0]:3d} ({note_name(args[0]):4s}) dur {args[1]}"
    if name == 'REST':
        return f"{a:04x}: rest dur {args[1]}" + ("  <END>" if args[1]==0 else "")
    if name == 'RANDOM':
        n, ch, off = args
        return f"{a:04x}: RANDOM pick 1 of {n} {ch} -> poke at +{off} (abs {a+n+3+off:04x})"
    return f"{a:04x}: {name} {args}"

if __name__ == '__main__':
    import sys
    im = Image(sys.argv[1])
    for s in sys.argv[2:]:
        start = int(s, 16)
        print(f"--- stream {start:04x}")
        for ev in parse_stream(im, start, limit=400):
            print(' ', fmt(ev))
