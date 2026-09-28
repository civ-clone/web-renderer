"""A Python re-implementation of the ASOUND.CVL AdLib driver (Civilization, 1991).

It reproduces the OPL2 register writes the original 8086 code makes, tick for tick, so it can be
checked against an emulation of the real driver.  It is also the reference for a port to another
language.  Addresses in comments are offsets inside the CVL's code segment (image + 0x000) and data
segment (image + 0x1e20)."""
import struct
from cvl import Image, PATCH_TABLE, PATCH_SIZE

VOICE_BASE = [0x741c, 0x743a, 0x7458, 0x7476, 0x7494, 0x74b2, 0x74d0, 0x74f0, 0x7510]
FADE_STREAM = 0x5eaa
ID33_STREAMS = [0x208, 0x27e, 0x50, 0x98, 0xf2, 0x138, 0x1a4]   # cs:0x1539 table


def s8(v):
    v &= 0xff
    return v - 256 if v & 0x80 else v


class Voice:
    __slots__ = ('dur', 'slide', 'fade_delta', 'pan_delta', 'note', 'instr', 'vol', 'release', 'gate',
                 'fade_ctr', 'fade_period', 'pans_ctr', 'pans_period', 'pan', 'start', 'pos',
                 'loop1', 'loop2', 'loop1_ctr', 'loop2_ctr', 'restart', 'detune', 'volofs')

    def __init__(self):
        for k in self.__slots__:
            setattr(self, k, 0)


class Driver:
    def __init__(self, path):
        self.im = Image(path)
        self.ds = bytearray(self.im.ds) + bytearray(0x10000 - len(self.im.ds))   # BSS zeroed
        self.shadow = [0] * 256          # ds:0x7536
        self.writes = []                 # (reg, val) in order
        self.events = []                 # high-level log for exporters
        self.voices = [Voice() for _ in range(9)]
        self.rng = self.im.rng_seed      # ds:0x73fd
        self.lock = 0                    # ds:0x741a
        self.paused = 0                  # ds:0x73ec
        self.saved_dur = [0] * 8         # ds:0x73ed..0x73f4
        self.id33_index = struct.unpack('<H', self.im.ds[0x73f5:0x73f7])[0]   # ds:0x73f5
        self.sweep_slot = 0              # ds:0x7533
        self.slot_voice = [0, 0]         # ds:0x7534 / 0x7535
        self.slot_count = [0, 0]         # ds:0x74ee / 0x750e
        self.slot_mask = [0, 0]          # ds:0x752e / 0x7530
        self.slot_value = [0, 0]         # ds:0x7412 / 0x7414
        self.slot_inc = [0, 0]           # ds:0x7416 / 0x7418
        self.sweep = [(0, 0, 0, 0)] * 9  # ds:0x7636, 8 bytes per voice
        self.fast_state = 0              # ds:0x73f7
        self.ret = 0                     # ds:0x73ea (SoundWorker return value)
        self.timer = 0                   # cs:0x0e0c (SoundTimer)
        self.tick = 0
        self.cur = 0                     # ds:0x7532 (voice being ticked)
        self.g_am = self.im.byte(0x73c0); self.g_vib = self.im.byte(0x73c2); self.g_csm = self.im.byte(0x73c4)
        self.rhythm = 0                  # ds:0x75f3 (never written; BSS)
        self.volflag = 1                 # uninitialised local [bp-4] of cs:0x07f4, see tick_voice

    # ---- low level -------------------------------------------------------------------------
    def rand(self):
        x = (self.rng + 0x9248) & 0xffff
        x = ((x >> 3) | (x << 13)) & 0xffff
        self.rng = x
        return x

    def write(self, reg, val):          # cs:0x10db
        reg &= 0xff; val &= 0xff
        self.shadow[reg] = val
        self.writes.append((self.tick, reg, val))

    def carrier_reg(self, v):
        return 0x40 + self.im.op_reg[self.im.voice_ops[v][1]]

    def update_volume(self, v):         # cs:0x0048
        V = self.voices[v]
        reg = self.carrier_reg(v)
        ksl = self.shadow[reg] & 0xc0
        a = V.vol + s8(V.volofs)
        a = max(0, min(0x3f, a))
        self.write(reg, (0x3f - a) | ksl)
        self.events.append((self.tick, v, 'level', a))

    def set_freq(self, v):              # cs:0x017c
        V = self.voices[v]
        n = V.note
        f = (self.im.fnum[n % 12] + s8(V.detune)) & 0xffff
        self.write(0xa0 + v, f & 0xff)
        keyon = self.shadow[0xb0 + v] & 0x20
        self.write(0xb0 + v, (keyon | ((n // 12) << 2) | (f >> 8)) & 0xff)

    def pitch_slide(self, v):           # cs:0x0230
        V = self.voices[v]
        w = (((self.shadow[0xb0 + v] & 0x1f) << 8) + self.shadow[0xa0 + v] + s8(V.slide)) & 0xffff
        self.write(0xa0 + v, w & 0xff)
        self.write(0xb0 + v, (self.shadow[0xb0 + v] & 0x20) | ((w >> 8) & 0xff))
        self.events.append((self.tick, v, 'freq', (w >> 10) & 7, w & 0x3ff))

    def key_off(self, v):               # cs:0x02be
        self.write(0xb0 + v, self.shadow[0xb0 + v] & 0xdf)
        self.events.append((self.tick, v, 'off'))

    def request_fast(self):             # cs:0x1262
        if self.fast_state != 1:
            self.fast_state = 1
            self.ret = 1

    def key_on(self, v):                # cs:0x02ec
        V = self.voices[v]
        self.update_volume(v)
        sw = self.sweep[v]
        if sw[0] == 0:
            self.set_freq(v)
            self.write(0xb0 + v, self.shadow[0xb0 + v] | 0x20)
            self.events.append((self.tick, v, 'on', V.note, V.instr, V.vol + s8(V.volofs), s8(V.detune)))
            return
        # noise / pitch-sweep instrument: frequency is driven by the fast worker instead
        if v == self.slot_voice[0]: self.sweep_slot = 0
        if v == self.slot_voice[1]: self.sweep_slot = 1
        s = self.sweep_slot
        self.sweep_slot ^= 1
        # Original bug: both paths test slot A's counter (ds:0x74ee), so taking slot B while slot A
        # is busy keys off whatever voice slot B last held (voice 0 before first use).
        if self.slot_count[0]:
            ov = self.slot_voice[s]
            self.write(0xb0 + ov, self.shadow[0xb0 + ov] & 0xdf)
        self.slot_voice[s] = v
        self.slot_count[s], self.slot_mask[s], self.slot_value[s], self.slot_inc[s] = sw
        self.request_fast()
        self.events.append((self.tick, v, 'sweep', V.instr, V.vol + s8(V.volofs)) + tuple(sw))

    def write_op(self, v, opreg, p):    # cs:0x04b4
        self.write(0x40 + opreg, 0x3f)
        self.write(0xbd, (self.rhythm & 0x3f) | (0x80 if self.g_am else 0) | (0x40 if self.g_vib else 0))
        self.write(0x08, 0x40 if self.g_csm else 0)
        self.write(0xc0 + v, (p[0xa] << 1) | (0 if p[0xd] else 1))
        self.write(0x60 + opreg, ((p[0] << 4) | (p[1] & 0xf)) & 0xff)
        self.write(0x80 + opreg, ((p[2] << 4) | (p[3] & 0xf)) & 0xff)
        self.write(0x20 + opreg, ((0x80 if p[0xb] else 0) + (0x40 if p[0xc] else 0) + (0x20 if p[4] else 0)
                                  + (0x10 if p[5] else 0) + (p[9] & 0xf)) & 0xff)
        self.write(0xe0 + opreg, p[8] & 3)
        self.write(0x40 + opreg, ((0x3f - (p[6] & 0x3f)) | (p[7] << 6)) & 0xff)

    def load_patch(self, v, n):         # cs:0x06c8
        self.write(0xb0 + v, self.shadow[0xb0 + v] & 0xdf)
        base = PATCH_TABLE + n * PATCH_SIZE
        p1 = self.ds[base:base + 0x16]
        p2 = self.ds[base + 0x16:base + 0x2c]
        m, c = self.im.voice_ops[v]
        self.write_op(v, self.im.op_reg[m], p1)
        self.sweep[v] = (p1[0xe], struct.unpack_from('<H', p1, 0x10)[0], struct.unpack_from('<H', p1, 0x12)[0],
                         struct.unpack_from('<H', p1, 0x14)[0])
        self.write_op(v, self.im.op_reg[c], p2)

    # ---- the per-voice tick, cs:0x07f4 -------------------------------------------------------
    def tick_voice(self, v):
        V = self.voices[v]
        ds = self.ds
        if V.dur == 0:
            return
        if V.gate:
            V.gate = (V.gate - 1) & 0xff
            if V.gate == 0:
                self.key_off(v)
        V.dur = (V.dur - 1) & 0xff
        # `volflag` is an uninitialised stack local in the original ([bp-4] in cs:0x07f4).  It is
        # cleared whenever a command byte is read and set by the volume/pan commands, so it only
        # survives to the note when the volume command is the last command before it.  For a note
        # with no command in front, the original reads whatever the previous voice tick left there;
        # the same frame is reused, so we keep it in self.volflag.
        if V.dur == 0:
            while True:
                pos = V.pos
                b = ds[pos]
                if b < 0xf3:
                    break
                self.volflag = 0
                if b == 0xff:                              # loop level 1
                    if V.loop1_ctr == 0:
                        n = s8(ds[pos + 1])
                        if n == 0:
                            V.pos += 2; V.loop1 = V.pos; V.loop1_ctr = 0
                        else:
                            V.loop1_ctr = n & 0xffff; V.pos = V.loop1
                            if n < 0:      # 0x80..0xff: 32768+ repeats, i.e. loops until stopped
                                self.events.append((self.tick, v, 'loop', V.loop1))
                    else:
                        V.loop1_ctr = (V.loop1_ctr - 1) & 0xffff
                        if V.loop1_ctr == 0:
                            V.pos += 2; V.loop1 = V.pos
                        else:
                            V.pos = V.loop1
                elif b == 0xfe:                            # loop level 2
                    if V.loop2_ctr == 0:
                        n = s8(ds[pos + 1])
                        if n == 0:
                            V.pos += 2; V.loop2 = V.pos; V.loop1 = V.pos; V.loop1_ctr = 0; V.loop2_ctr = 0
                        else:
                            V.loop2_ctr = n & 0xffff; V.pos = V.loop2; V.loop1 = V.loop2
                            if n < 0:
                                self.events.append((self.tick, v, 'loop', V.loop2))
                    else:
                        V.loop2_ctr = (V.loop2_ctr - 1) & 0xffff
                        if V.loop2_ctr == 0:
                            V.pos += 2; V.loop2 = V.pos; V.loop1 = V.pos
                        else:
                            V.pos = V.loop2; V.loop1 = V.loop2
                elif b == 0xfd:                            # restart from the top
                    V.pos = V.loop1 = V.loop2 = V.restart
                    V.slide = V.fade_delta = V.pan_delta = V.vol = V.release = V.fade_ctr = V.pans_ctr = 0
                    V.loop1_ctr = V.loop2_ctr = 0
                    V.detune = V.volofs = 0
                    V.pan = 0x40
                    self.events.append((self.tick, v, 'restart'))
                elif b == 0xfc:                            # instrument
                    V.instr = ds[pos + 1]; V.pos += 2
                    self.load_patch(v, V.instr)
                    self.events.append((self.tick, v, 'instr', V.instr))
                elif b == 0xfb:                            # ticks of key-off before the next note
                    V.release = ds[pos + 1]; V.pos += 2
                elif b == 0xfa:                            # per-tick pitch slide
                    V.slide = ds[pos + 1]; V.pos += 2
                elif b == 0xf9:                            # volume 0..127
                    V.vol = (s8(ds[pos + 1]) >> 1) & 0xff; V.pos += 2; self.volflag = 1
                    self.events.append((self.tick, v, 'vol', V.vol))
                elif b == 0xf8:                            # fade: period, signed delta
                    V.fade_period = ds[pos + 1]; V.fade_delta = ds[pos + 2]; V.fade_ctr = 1; V.pos += 3
                elif b == 0xf7:                            # detune (added to the F-number)
                    V.detune = ds[pos + 1]; V.pos += 2
                elif b == 0xf6:                            # random poke
                    n = s8(ds[pos + 1])
                    si = pos + 2
                    self.rand()
                    r = (n - 1) & self.rng
                    chosen = ds[si + r]
                    off = s8(ds[si + n])
                    ds[si + n + 1 + off] = chosen
                    V.pos += n + 3
                    self.events.append((self.tick, v, 'random', si + n + 1 + off, chosen))
                elif b == 0xf5:                            # volume offset (fade position)
                    V.volofs = ds[pos + 1]; V.pos += 2; self.volflag = 1
                elif b == 0xf4:                            # pan (0x40 = centre; stereo cards only)
                    V.pan = ds[pos + 1]; V.pos += 2; self.volflag = 1
                elif b == 0xf3:                            # pan slide: period, delta
                    V.pans_period = ds[pos + 1]; V.pan_delta = ds[pos + 2]; V.pans_ctr = 1; V.pos += 3
            # a note (or rest / end marker)
            if self.volflag:
                self.update_volume(v)
            note, dur = ds[V.pos], ds[V.pos + 1]
            V.note = note; V.dur = dur; V.pos += 2
            if note == 0 or dur == 0:
                self.key_off(v)
                if dur == 0:
                    self.events.append((self.tick, v, 'end'))
            else:
                V.gate = (dur - V.release) & 0xff
                self.key_on(v)
        # per-tick effects (cs:0x0ca9)
        if V.slide:
            self.pitch_slide(v)
        self.volflag = 0
        if V.fade_ctr == 0 and V.pans_ctr == 0:
            return
        V.fade_ctr = (V.fade_ctr - 1) & 0xff
        if V.fade_ctr == 0:
            V.fade_ctr = V.fade_period
            if V.fade_delta:
                V.volofs = (V.volofs + V.fade_delta) & 0xff
                self.volflag = 1
                if s8(V.volofs) <= 0:
                    V.fade_ctr = 0; V.volofs = 0; V.vol = 0
                if s8(V.volofs) >= 0x3f:
                    V.fade_ctr = 0; V.volofs = 0x3f; V.vol = 0
        V.pans_ctr = (V.pans_ctr - 1) & 0xff
        if V.pans_ctr == 0:
            V.pans_ctr = V.pans_period
            if V.pan_delta:
                V.pan = (V.pan + V.pan_delta) & 0xff
                self.volflag = 1
        if self.volflag:
            self.update_volume(v)

    # ---- driver entry points -----------------------------------------------------------------
    def sound_worker(self):             # cs:0x115b, called at 60 Hz
        self.rand()
        if self.lock == 0xffff:
            return self._ret()
        if self.paused and self.voices[8].dur == 0:
            for i in range(8):
                self.voices[i].dur = self.saved_dur[i]
            self.voices[8].pos = FADE_STREAM
            self.paused = 0
        self.timer = (self.timer + 1) & 0xffff
        for v in range(9):
            self.cur = v
            self.tick_voice(v)
        if self.slot_count[0] == 0 and self.slot_count[1] == 0:
            if self.fast_state != 0xffff:
                self.fast_state = 0xffff
                self.ret = 0xffff
            return self._ret()
        for s in (0, 1):
            if self.slot_count[s]:
                self.slot_value[s] = (self.slot_value[s] + self.slot_inc[s]) & 0xffff
                self.slot_count[s] = (self.slot_count[s] - 1) & 0xff
                if self.slot_count[s] == 0:
                    v = self.slot_voice[s]
                    o = 1 - s
                    if self.slot_count[o] == 0 or v != self.slot_voice[o]:
                        self.write(0xa0 + v, 0)
                        self.write(0xb0 + v, 0)
                        self.events.append((self.tick, v, 'off'))
        return self._ret()

    def _ret(self):
        r = self.ret
        self.ret = 0
        self.tick += 1
        return r

    def fast_worker(self):              # cs:0x121f, called at ~300 Hz while requested
        self.rand()
        if self.slot_count[0]:
            w = (((self.rng ^ 0xffff) & self.slot_mask[0]) + self.slot_value[0]) & 0xffff
            self._raw_freq(self.slot_voice[0], w)
        if self.slot_count[1]:
            w = ((self.rng & self.slot_mask[1]) + self.slot_value[1]) & 0xffff
            self._raw_freq(self.slot_voice[1], w)

    def _raw_freq(self, v, w):          # cs:0x1134
        self.write(0xa0 + v, w & 0xff)
        self.write(0xb0 + v, ((w >> 8) & 0xff) | 0x20)

    def sound_timer(self):
        return self.timer

    def reset(self):                    # cs:0x0f27 (PlayTune 0 and Close)
        saved = self.lock; self.lock = 0xffff
        self.paused = 0
        for V in self.voices:
            V.dur = V.slide = V.fade_delta = V.pan_delta = 0
        self.slot_count = [0, 0]; self.slot_mask = [0, 0]; self.slot_value = [0, 0]; self.slot_inc = [0, 0]
        for r in range(0x4f, 0x3f, -1):
            self.write(r, 0x3f)
        for r in range(0xff, 0x5f, -1):
            self.write(r, 0)
        for r in range(0x3f, 0, -1):
            self.write(r, 0)
        self.write(1, 0x20)
        self.lock = saved

    def start_voice(self, v, stream):   # cs:0x12b2
        saved = self.lock; self.lock = 0xffff
        V = self.voices[v]
        V.start = V.pos = V.loop1 = V.loop2 = V.restart = stream
        V.fade_period = 0xff
        V.slide = V.fade_delta = V.pan_delta = 0
        V.detune = V.volofs = 0
        V.vol = V.fade_ctr = V.pans_ctr = 0
        V.loop1_ctr = V.loop2_ctr = 0
        V.release = 0
        V.pan = 0x40
        V.dur = 1
        self.lock = saved

    def play(self, sid, param=3):       # cs:0x1d80
        if sid > 0x2c:
            return 0
        r = self._play(sid, param)
        self.timer = 0
        return r

    def _play(self, sid, param):
        ds = self.ds
        if sid == 0:
            self.reset(); return 0
        if sid == 1:                    # fade everything out
            for V in self.voices:
                V.pos = FADE_STREAM; V.fade_delta = 0xff; V.fade_period = 1; V.fade_ctr = 1
            return 0
        if sid == 2:                    # query: anything still playing?
            r = 0
            for V in self.voices: r |= V.dur
            return r
        if sid == 33:                   # interrupt the music with one of seven jingles on voice 8
            saved = self.lock; self.lock = 0xffff
            for i in range(8):
                self.saved_dur[i] = self.voices[i].dur; self.voices[i].dur = 0
            for op in (0x43, 0x44, 0x45, 0x4b, 0x4c, 0x4d, 0x53, 0x54, 0x55):
                self.write(op, self.shadow[op] | 0x3f)
            self.paused = 0xff
            self.lock = saved
            self.id33_index += 1
            if self.id33_index > 6: self.id33_index = 0
            self.start_voice(8, ID33_STREAMS[self.id33_index])
            return 0
        if sid == 38 or sid == 39:
            if sid == 39:
                self.start_voice(0, 0x68a4)
            stream = 0x6898 if sid == 38 else 0x688c
            self.rand()
            ax = ((self.rng & 0x707) + 0x140c) & 0xffff
            al, ah = ax & 0xff, ax >> 8
            ds[stream + 5] = al; ds[stream + 7] = ah; ds[0x68a5] = (al + ah) & 0xff
            self.start_voice(1, stream)
            return 0
        if sid == 44:
            self.rand(); ds[0x68fa + 1] = (self.rng & 7) + 0xe; self.start_voice(0, 0x68fa)
            self.rand(); ds[0x6900 + 1] = (self.rng & 7) + 0x1c; self.start_voice(1, 0x6900)
            self.rand(); ds[0x6906 + 1] = (self.rng & 7) + 0x2a; self.start_voice(2, 0x6906)
            for v in (0, 1, 2): self.voices[v].loop1 = 0x690c
            self.start_voice(3, 0x690c)
            return 0
        t = TUNES[sid]
        if t and isinstance(t[0], list):
            t = t[param & 3]
        for v, stream in t:
            self.start_voice(v, stream)
        return 0


# voice -> stream assignments, captured from the real driver (dump_tunes.py).  IDs 5-18 take the
# second PlayTune argument (0-3) which selects one of four arrangements.
TUNES = {
    3: [(0, 0x4aa8), (1, 0x4bf8), (2, 0x4d1c), (3, 0x4dbe), (4, 0x4e78), (5, 0x4f30), (6, 0x4fba), (7, 0x5040)],
    4: [(0, 0x2da4), (1, 0x3014), (2, 0x3170), (3, 0x33f4), (4, 0x360e), (5, 0x38b6), (6, 0x3a2a), (7, 0x3cee)],
    5: [[(3, 0x2c76)], [(2, 0x2afa), (3, 0x2c76)], [(1, 0x2a5e), (2, 0x2afa), (3, 0x2c76)],
        [(0, 0x297a), (1, 0x2a5e), (2, 0x2afa), (3, 0x2c76)]],
    6: [[(3, 0x06a4)], [(2, 0x066c), (3, 0x06a4)], [(1, 0x05b0), (2, 0x066c), (3, 0x06a4)],
        [(0, 0x0540), (1, 0x05b0), (2, 0x066c), (3, 0x06a4)]],
    7: [[(6, 0x0928)], [(1, 0x080c), (2, 0x0864), (3, 0x08be), (6, 0x0928)],
        [(0, 0x0742), (1, 0x080c), (2, 0x0864), (3, 0x08be), (4, 0x0918), (6, 0x0928)],
        [(0, 0x0742), (1, 0x080c), (2, 0x0864), (3, 0x08be), (4, 0x0918), (6, 0x0928)]],
    8: [[(6, 0x0ba6)], [(2, 0x0b1c), (6, 0x0ba6)], [(1, 0x0a96), (2, 0x0b1c), (6, 0x0ba6)],
        [(0, 0x0a02), (1, 0x0a96), (2, 0x0b1c), (6, 0x0ba6)]],
    9: [[(4, 0x6090), (7, 0x62f8)], [(4, 0x6090), (5, 0x615c), (6, 0x622c), (7, 0x62f8)],
        [(2, 0x5f48), (3, 0x6036), (4, 0x6090), (5, 0x615c), (6, 0x622c), (7, 0x62f8)],
        [(0, 0x5e0e), (1, 0x5eac), (2, 0x5f48), (3, 0x6036), (4, 0x6090), (5, 0x615c), (6, 0x622c), (7, 0x62f8)]],
    10: [[(2, 0x0e8e), (6, 0x0f4e)], [(2, 0x0e8e), (3, 0x0fbc), (4, 0x10ec), (6, 0x0f4e), (7, 0x1072)],
         [(1, 0x0dcc), (2, 0x0e8e), (3, 0x0fbc), (4, 0x10ec), (5, 0x1168), (6, 0x0f4e), (7, 0x1072)],
         [(0, 0x0d36), (1, 0x0dcc), (2, 0x0e8e), (3, 0x0fbc), (4, 0x10ec), (5, 0x1168), (6, 0x0f4e), (7, 0x1072)]],
    11: [[(6, 0x4312), (7, 0x438a)], [(0, 0x3fde), (1, 0x405c), (6, 0x4312), (7, 0x438a)],
         [(0, 0x3fde), (1, 0x405c), (2, 0x4100), (3, 0x41d0), (4, 0x424a), (5, 0x42ae), (6, 0x4312), (7, 0x438a)],
         [(0, 0x3fde), (1, 0x405c), (2, 0x4100), (3, 0x41d0), (4, 0x424a), (5, 0x42ae), (6, 0x4312), (7, 0x438a)]],
    12: [[(3, 0x24e2), (4, 0x2562), (5, 0x25e2), (6, 0x268c)],
         [(2, 0x232a), (3, 0x24e2), (4, 0x2562), (5, 0x25e2), (6, 0x268c), (7, 0x26e4)],
         [(0, 0x1f6a), (1, 0x2148), (2, 0x232a), (3, 0x24e2), (4, 0x2562), (5, 0x25e2), (6, 0x268c), (7, 0x26e4)],
         [(0, 0x1f6a), (1, 0x2148), (2, 0x232a), (3, 0x24e2), (4, 0x2562), (5, 0x25e2), (6, 0x268c), (7, 0x26e4)]],
    13: [[(2, 0x5b96), (3, 0x5c16)], [(1, 0x5a1a), (2, 0x5b96), (3, 0x5c16), (4, 0x5d14)],
         [(0, 0x5886), (1, 0x5a1a), (2, 0x5b96), (3, 0x5c16), (4, 0x5d14)],
         [(0, 0x5886), (1, 0x5a1a), (2, 0x5b96), (3, 0x5c16), (4, 0x5d14)]],
    14: [[(2, 0x1534), (3, 0x1586), (4, 0x15d4), (5, 0x161e), (6, 0x166a)],
         [(1, 0x143a), (2, 0x1534), (3, 0x1586), (4, 0x15d4), (5, 0x161e), (6, 0x166a)],
         [(0, 0x133a), (1, 0x143a), (2, 0x1534), (3, 0x1586), (4, 0x15d4), (5, 0x161e), (6, 0x166a)],
         [(0, 0x133a), (1, 0x143a), (2, 0x1534), (3, 0x1586), (4, 0x15d4), (5, 0x161e), (6, 0x166a)]],
    15: [[(3, 0x043e), (4, 0x0468), (5, 0x0490)], [(2, 0x03fa), (3, 0x043e), (4, 0x0468), (5, 0x0490)],
         [(1, 0x0362), (2, 0x03fa), (3, 0x043e), (4, 0x0468), (5, 0x0490), (6, 0x03ac)],
         [(0, 0x02d0), (1, 0x0362), (2, 0x03fa), (3, 0x043e), (4, 0x0468), (5, 0x0490), (6, 0x03ac)]],
    16: [[(0, 0x187c), (1, 0x18c8), (3, 0x1970), (5, 0x196e), (7, 0x18c6)],
         [(0, 0x187c), (1, 0x18c8), (2, 0x1924), (3, 0x1970), (5, 0x196e), (7, 0x18c6)],
         [(0, 0x187c), (1, 0x18c8), (2, 0x1924), (3, 0x1970), (4, 0x199e), (5, 0x196e), (6, 0x19a0), (7, 0x18c6)],
         [(0, 0x187c), (1, 0x18c8), (2, 0x1924), (3, 0x1970), (4, 0x199e), (5, 0x196e), (6, 0x19a0), (7, 0x18c6)]],
    17: [[(6, 0x1e32), (7, 0x1e86)], [(2, 0x1dc2), (3, 0x1de0), (4, 0x1dfc), (5, 0x1e18), (6, 0x1e32), (7, 0x1e86)],
         [(1, 0x1c16), (2, 0x1dc2), (3, 0x1de0), (4, 0x1dfc), (5, 0x1e18), (6, 0x1e32), (7, 0x1e86)],
         [(0, 0x1a68), (1, 0x1c16), (2, 0x1dc2), (3, 0x1de0), (4, 0x1dfc), (5, 0x1e18), (6, 0x1e32), (7, 0x1e86)]],
    18: [[(2, 0x46f6), (3, 0x47f0)], [(1, 0x4604), (2, 0x46f6), (3, 0x47f0), (4, 0x48d0)],
         [(0, 0x4504), (1, 0x4604), (2, 0x46f6), (3, 0x47f0), (4, 0x48d0)],
         [(0, 0x4504), (1, 0x4604), (2, 0x46f6), (3, 0x47f0), (4, 0x48d0), (5, 0x49a8)]],
    19: [(0, 0x2d18), (1, 0x2d3e), (2, 0x2d56), (3, 0x2d88)],
    20: [(0, 0x06e6), (1, 0x0700), (2, 0x0716), (3, 0x0730)],
    21: [(0, 0x0988), (1, 0x09aa), (2, 0x09cc), (6, 0x09f0)],
    22: [(0, 0x0c84), (1, 0x0cb0), (2, 0x0cd8), (6, 0x0d00)],
    23: [(0, 0x632a), (1, 0x6346), (2, 0x6366), (3, 0x6382), (4, 0x639e), (5, 0x63ae)],
    24: [(0, 0x1222), (1, 0x1264), (2, 0x12aa), (3, 0x12e6), (4, 0x1310)],
    25: [(0, 0x4448), (1, 0x445a), (2, 0x446c), (3, 0x447e), (4, 0x4498), (5, 0x44b2), (6, 0x44cc), (7, 0x44e6)],
    26: [(0, 0x2870), (1, 0x2896), (2, 0x28bc), (3, 0x28e2), (4, 0x2908), (5, 0x292e), (6, 0x2954)],
    27: [(0, 0x5d92), (1, 0x5dac), (2, 0x5dc6), (3, 0x5dd6), (4, 0x5dee)],
    28: [(0, 0x17c2), (1, 0x17d2), (2, 0x17e2), (3, 0x1804), (4, 0x181c), (5, 0x1834), (6, 0x184c)],
    29: [(0, 0x04ba), (1, 0x04d8), (2, 0x04ec), (3, 0x04fe), (4, 0x050e), (5, 0x051c), (6, 0x052c)],
    30: [(0, 0x1a14), (1, 0x1a24), (2, 0x1a34), (3, 0x1a46), (4, 0x1a22), (5, 0x1a44), (6, 0x1a56), (7, 0x1a58)],
    31: [(0, 0x1eb6), (1, 0x1ec8), (2, 0x1eda), (3, 0x1eec), (4, 0x1f02), (5, 0x1f40)],
    32: [(0, 0x4a2e), (1, 0x4a4c), (2, 0x4a6a), (3, 0x4a88), (4, 0x4a98)],
    34: [(0, 0x5156), (1, 0x51e6), (2, 0x5276), (3, 0x5456), (4, 0x54d6), (5, 0x5556), (6, 0x5736), (7, 0x5830)],
    35: [(0, 0x63ce), (1, 0x6446), (2, 0x64a0), (3, 0x64f4), (4, 0x6542), (5, 0x6590), (6, 0x6604)],
    36: [(1, 0x32c2), (2, 0x34da), (3, 0x3804), (4, 0x3976), (5, 0x3bf6), (6, 0x3edc)],
    37: [(0, 0x68ee)],
    40: [(6, 0x6870)],
    41: [(2, 0x687c), (3, 0x6864)],
    42: [(4, 0x68c6), (5, 0x68b4)],
    43: [(0, 0x68d2), (1, 0x68e2)],
}


def run(path, sid, param=3, max_ticks=20000, stop_on_restart=True, stop_when_silent=True):
    """Play one ID and return the driver after it finished (or hit the limit)."""
    d = Driver(path)
    d.reset()                   # what Init does to the chip
    d.writes = []
    d.play(sid, param)
    fast = False
    for _ in range(max_ticks):
        for k in range(5):      # 300 Hz interrupt; SoundWorker on every fifth one
            if fast:
                d.fast_worker()
            if k == 4:
                r = d.sound_worker()
                if r == 1: fast = True
                elif r == 0xffff: fast = False
        if stop_on_restart and any(e[2] == 'restart' for e in d.events[-40:] if e[0] == d.tick - 1):
            break
        if stop_when_silent and all(V.dur == 0 for V in d.voices) and d.slot_count == [0, 0]:
            break
    return d
