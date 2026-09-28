"""Render a sound ID to a WAV file through an OPL2 emulator (pyopl, DOSBox's DBOPL), using the
register writes produced by sim.py.  Fast-worker writes are placed on their 300 Hz sub-ticks.

    python render.py ASOUND.CVL id out.wav [seconds] [param]
"""
import struct, sys, wave
import pyopl
from sim import Driver

RATE = 44100


def render(path, sid, out, seconds=30.0, param=3):
    d = Driver(path)
    d.reset()
    opl = pyopl.opl(RATE, sampleSize=2, channels=1)
    for _, r, v in d.writes:
        opl.writeReg(r, v)
    d.writes = []
    d.play(sid, param)
    fast = False
    frames = bytearray()
    acc = 0.0
    step = RATE / 300.0
    total_sub = int(seconds * 300)
    silent_ticks = 0
    for sub in range(total_sub):
        if fast:
            d.fast_worker()
        if sub % 5 == 4:
            r = d.sound_worker()
            if r == 1: fast = True
            elif r == 0xffff: fast = False
            if all(V.dur == 0 for V in d.voices) and d.slot_count == [0, 0]:
                silent_ticks += 1
            else:
                silent_ticks = 0
        for _, r, v in d.writes:
            opl.writeReg(r, v)
        d.writes = []
        acc += step
        n = int(acc); acc -= n
        buf = bytearray(n * 2)
        opl.getSamples(buf)
        frames += buf
        if silent_ticks > 90:          # 1.5 s of nothing left to play
            break
    with wave.open(out, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
        w.writeframes(bytes(frames))
    return len(frames) / 2 / RATE


if __name__ == '__main__':
    path, sid, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]
    seconds = float(sys.argv[4]) if len(sys.argv) > 4 else 30.0
    param = int(sys.argv[5]) if len(sys.argv) > 5 else 3
    print(f'{out}: {render(path, sid, out, seconds, param):.1f} s')
