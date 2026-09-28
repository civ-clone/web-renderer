"""Check sim.py against the real driver running under unicorn: identical OPL register writes,
tick for tick, for every sound ID."""
import os, sys
from emu import Drv
from sim import Driver

PATH = os.environ['CVL']


def run_real(sid, param, ticks):
    d = Drv(PATH)
    d.call(0, 0)
    d.opl = []
    d.call(1, sid, param)
    fast = False
    for t in range(ticks):
        d.t = t
        for k in range(5):
            if fast:
                d.call(4)
            if k == 4:
                r = d.call(3)
                if r == 1: fast = True
                elif r == 0xffff: fast = False
    return d.opl


def run_sim(sid, param, ticks):
    d = Driver(PATH)
    d.reset(); d.writes = []
    d.play(sid, param)
    fast = False
    for t in range(ticks):
        for k in range(5):
            if fast:
                d.fast_worker()
            if k == 4:
                r = d.sound_worker()
                if r == 1: fast = True
                elif r == 0xffff: fast = False
    return d.writes


def compare(sid, param, ticks):
    a = run_real(sid, param, ticks)
    b = run_sim(sid, param, ticks)
    n = min(len(a), len(b))
    for i in range(n):
        if a[i] != b[i]:
            ctx = lambda L: [(t, hex(r), hex(v)) for t, r, v in L[max(0, i - 4):i + 4]]
            return f"MISMATCH at write {i}: real {ctx(a)} sim {ctx(b)}"
    if len(a) != len(b):
        return f"LENGTH real {len(a)} sim {len(b)} (first {n} identical); tail real {a[n:n+5]} sim {b[n:n+5]}"
    return f"OK {len(a)} writes"


if __name__ == '__main__':
    ticks = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
    ids = [int(x) for x in sys.argv[2].split(',')] if len(sys.argv) > 2 else range(45)
    params = [int(x) for x in sys.argv[3].split(',')] if len(sys.argv) > 3 else [3]
    for sid in ids:
        for p in params:
            print(f"id {sid:2d} p{p}: {compare(sid, p, ticks)}", flush=True)
