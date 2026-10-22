"""Run GSOUND.CVL (the 1994 General MIDI driver) under unicorn and capture the MIDI bytes it sends
to the MPU-401 data port, with the 60 Hz tick each byte was sent on."""
import struct, sys
from unicorn import *
from unicorn.x86_const import *
from emu import Drv, LOAD

MPU_DATA, MPU_STAT = 0x330, 0x331


class GM(Drv):
    def __init__(self, path):
        super().__init__(path)
        self.midi = []        # (tick, byte)
        self.mpu_cmd = 0      # a command was written, ack pending
        self.pit = 0xffff
        self.pit_lo = True
        self.ints = []

    def hin(self, mu, port, size, ud):
        if port == MPU_STAT:
            return 0x00 if self.mpu_cmd else 0x80     # bit7=0: data ready (ack), bit6=0: ready for output
        if port == MPU_DATA:
            self.mpu_cmd = 0
            return 0xfe                                # MPU ack
        if port == 0x40:                               # PIT counter 0, used for delays
            self.pit_lo = not self.pit_lo
            if not self.pit_lo:
                return self.pit >> 8
            self.pit = (self.pit - 37) & 0xffff
            return self.pit & 0xff
        if port in (0x388, 0x389):
            return 0
        return 0

    def hout(self, mu, port, size, val, ud):
        if port == MPU_DATA:
            self.midi.append((self.t, val & 0xff))
        elif port == MPU_STAT:
            self.mpu_cmd = 1
            self.other.append((self.t, 'mpucmd', val & 0xff))
        else:
            self.other.append((self.t, port, val & 0xff))

    def hint(self, mu, intno, ud):
        ax = mu.reg_read(UC_X86_REG_AX)
        self.ints.append((self.t, intno, hex(ax)))
        if intno == 0x21:
            # DOS: fail every file call (config.snd not found), succeed otherwise
            fl = mu.reg_read(UC_X86_REG_EFLAGS)
            if (ax >> 8) in (0x3d, 0x3f, 0x3e, 0x4e):
                mu.reg_write(UC_X86_REG_EFLAGS, fl | 1)
                mu.reg_write(UC_X86_REG_AX, 2)
            else:
                mu.reg_write(UC_X86_REG_EFLAGS, fl & ~1)


def run(path, sid, ticks, param=3):
    d = GM(path)
    r = d.call(0, 0)
    init_midi = d.midi; d.midi = []
    d.call(1, sid, param)
    fast = False
    for t in range(ticks):
        d.t = t
        for k in range(5):
            if fast:
                d.call(4)
            if k == 4:
                rr = d.call(3)
                if rr == 1: fast = True
                elif rr == 0xffff: fast = False
    return d, r, init_midi


if __name__ == '__main__':
    path = sys.argv[1]; sid = int(sys.argv[2]); ticks = int(sys.argv[3])
    d, r, ini = run(path, sid, ticks)
    print('init ->', r, 'init midi bytes', len(ini), 'ints', d.ints[:12], 'other', d.other[:10])
    print('init bytes:', ' '.join('%02x' % b for _, b in ini[:120]))
    print('play midi bytes', len(d.midi), 'last tick', d.midi[-1][0] if d.midi else None)
    print(' '.join(f'{t}:{b:02x}' for t, b in d.midi[:150]))
