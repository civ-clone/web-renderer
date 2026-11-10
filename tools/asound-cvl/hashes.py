"""SHA-256 of sim.py's register-write stream for every ID and level, the fixture the TypeScript
driver (packages/audio/cvl/) is checked against in tests/ui/cvlDriver.ts.

    python3 hashes.py "$CVL" > ../../tests/ui/fixtures/cvl-driver.json
    python3 hashes.py "$CVL" --dump 33 3      # one stream's writes, one per line, for debugging

Each run is `Driver`, `reset()`, the writes so far dropped, `play(id, level)`, then TICKS periods
of the 300 Hz interrupt as `run()` plays them, with none of its stop conditions: in each period the
fast worker runs on all five interrupts while it is requested, and `sound_worker()` on the fifth,
after that interrupt's fast worker.

Every write is labelled (tick, sub). Writes made by `play()` and by `sound_worker()` number `tick`
are (tick, 0). The fast worker's writes after `sound_worker()` number `tick` and before the next
one are (tick, 1) to (tick, 5), one sub per interrupt, so a write's time is (5 * tick + sub) / 300 s
after the first `sound_worker()`, and the stream is in (tick, sub) order. (tick, 5) shares its
interrupt with tick + 1's `sound_worker()` but comes first.

Each write is serialised as 7 bytes, tick u32 LE, sub u8, register u8, value u8, and the hash is of
those bytes concatenated in emission order.

The scenarios check PlayTune on a driver that is already playing: each is a list of (tick, id, level)
calls, made at the start of that tick's period, before its interrupts, the first at tick 0 as above.
For each call it records `sound_timer()` just before it and what `play()` returned, and the timer
again after the last period, as well as the hash of every write from the first call on.
Only stdlib; needs nothing from requirements.txt."""
import hashlib
import json
import struct
import sys

from sim import Driver

TICKS = 2400
IDS = range(45)
LEVELS = range(4)


class LabelledDriver(Driver):
    def __init__(self, path):
        self.label = (0, 0)
        self.stream = None
        super().__init__(path)

    def write(self, reg, val):
        super().write(reg, val)
        if self.stream is not None:
            self.stream.append((self.label[0], self.label[1], reg & 0xff, val & 0xff))


# Tunes interrupted while playing: faded (1), queried (2), reset (0), the war drums over the music
# (33), and a tune started over a fade.
SCENARIOS = [
    {'ticks': 1200, 'calls': [[0, 3, 3], [300, 2, 3], [300, 1, 3], [301, 2, 3], [900, 2, 3]]},
    {'ticks': 1500, 'calls': [[0, 3, 3], [200, 33, 3], [600, 2, 3], [601, 33, 3]]},
    {'ticks': 600, 'calls': [[0, 38, 3], [20, 2, 3], [300, 2, 3]]},
    {'ticks': 600, 'calls': [[0, 4, 3], [120, 0, 3], [121, 2, 3]]},
    {'ticks': 1200, 'calls': [[0, 5, 2], [400, 1, 3], [430, 6, 1], [800, 2, 3]]},
]


def writes(path, sid, level, ticks=TICKS):
    return scenario(path, [[0, sid, level]], ticks)[0]


def scenario(path, calls, ticks):
    d = LabelledDriver(path)
    d.reset()
    d.stream = []
    returns = []
    timers = []
    fast = False
    for tick in range(ticks):
        for at, sid, level in calls:
            if at == tick:
                timers.append(d.sound_timer())
                returns.append(d.play(sid, level))
        for k in range(5):
            if fast:
                d.label = (tick - 1, k + 1)
                d.fast_worker()
            if k == 4:
                d.label = (tick, 0)
                r = d.sound_worker()
                if r == 1:
                    fast = True
                elif r == 0xffff:
                    fast = False
    timers.append(d.sound_timer())
    return d.stream, returns, timers


def digest(stream):
    h = hashlib.sha256()
    for w in stream:
        h.update(struct.pack('<IBBB', *w))
    return h.hexdigest()


def main(argv):
    path = argv[1]
    if len(argv) > 2 and argv[2] == '--dump':
        for w in writes(path, int(argv[3]), int(argv[4])):
            print('%d %d %02x %02x' % w)
        return
    out = {
        'ticks': TICKS,
        'serialisation': 'per write: tick u32 LE, sub u8, register u8, value u8',
        'hashes': {},
    }
    for sid in IDS:
        out['hashes'][str(sid)] = []
        for level in LEVELS:
            s = writes(path, sid, level)
            out['hashes'][str(sid)].append({'writes': len(s), 'sha256': digest(s)})
    out['scenarios'] = []
    for sc in SCENARIOS:
        s, returns, timers = scenario(path, sc['calls'], sc['ticks'])
        out['scenarios'].append(dict(sc, writes=len(s), sha256=digest(s), returns=returns, timers=timers))
    json.dump(out, sys.stdout, indent=2)
    sys.stdout.write('\n')


if __name__ == '__main__':
    main(sys.argv)
