# What `baseline.json` records, and what changed

Two independent things, recorded at turns 1, 10 and 50 of a seeded four-player
game on a 60×40 world:

- **`checksums`** — engine state. Registry sizes, a terrain hash, and
  id/type/scalars for every player, city and unit.
- **`snapshots.*.dto`** — the object count, byte size and hash of what
  `DataObject.toPlainObject()` emits for those same entities. This is the
  renderer's actual transport payload.

They are separate on purpose. "The engine behaves identically" and "the wire
format is unchanged" are different questions.

## The checksum was widened in Stage 4

It used to be a deliberately narrow subset: entity id, type, and a hand-listed
set of scalars. It now covers **every non-transient field of every saveable
entity**, through `DataObject.stateKeys()` — 2,459 entities and 9,729 fields at
turn 1, rising to 2,490 and 9,970 by turn 50.

**The old numbers are not comparable with the new ones.** `7d6b6b04 /
73a0cc05 / 3431063b` held unchanged through Stages 1, 2 and 3, which is exactly
what let each of those stages claim it changed nothing. Widening ends that, so
it was done in a commit that does nothing else: the discontinuity has one cause
and the commit that caused it says so.

`snapshots.*.state` records the entity and field counts beside the hash, which
makes a drift diagnosable rather than merely detectable. Removing
`_ruleRegistry` from `City`'s `transient` declaration — the whole failure mode
Stage 4 exists to prevent — moves turn 10 from 9,793 fields to 9,796 and turn
50 from 9,970 to 9,976: one per city, and turn 1 unaffected because no city
exists yet. Every other part of the snapshot is identical under that change,
which is why the narrow subset could not have caught it.

References inside the digest are by id. `City._player` holds a `Player` whose
`_civilization` holds a `Civilization`, and `City._tile` reaches the `World` and
through it every tile — inlining any of that either never terminates or hashes
the same data hundreds of times. Anything that is neither a primitive nor a
`DataObject` is reduced to its class name, which is honest rather than
complete: `Unit._busy`, `Unit._status` and `PlayerTreasury._yield` are exactly
the fields with no save representation yet, and they are waiting on Stage 6's
named rules.

Nothing rule-computed is included. `city.yields()` and `unit.actions()`
reallocate their `Yield` objects on every call, so including them would make the
checksum change on every run for no reason.

## What the suite has actually caught

Worth knowing, because it shapes what belongs in a snapshot and what does not.

- **Stage 1's one wire-format change** (below). The narrow state checksum would
  never have seen it; the DTO digest did.
- **Stage 3's silently absent rules.** A stale entrypoint in `node_modules`
  meant the rule that builds the world registered into a registry nothing read.
  The suite's symptom was ending after `engine:start` with no output, no error
  and exit code 0 — `The run produced no result document.` That is the failure
  mode `05-engine-plan.md` predicts for Stage 3, and the suite is what surfaced
  it within a minute.

Two rules follow from that:

**An instrument must not change the thing it measures.** `mathRandomCalls` was
added inside the hashed snapshot, and every checksum moved — not because the
engine had changed, but because the snapshot had a new field. It and the DTO
digest now sit outside the checksum, so "is the engine state the same", "is the
wire format the same" and "does anything still reach the global generator" are
three separate answers.

**A run that produces nothing is a failure, not a pass.** The harness exits
non-zero if it never reaches a checkpoint, and the runner refuses a result
document it cannot find. Both were needed before the Stage 3 bug read as
anything other than success.

## Accepted change: Stage 1

Stage 1 (`#private` → `private`) left every checksum identical and moved the DTO
digest. Recorded here because it is the one wire-format change in that stage and
it should not be rediscovered as a mystery.

| | Before Stage 1 | After |
| - | -------------- | ----- |
| turn 1 | `objects 788, bytes 135383, hash 67d92604` | unchanged |
| turn 10 | `objects 3245, bytes 551730, hash 8c0143ad` | `objects 3245, bytes 552837, hash c27f4b32` |
| turn 50 | `objects 53120, bytes 8891397, hash 306d3da3` | `objects 53120, bytes 8900253, hash 40a7e611` |

The object count is unchanged; only the byte count moved, by ~0.1%.

**Cause.** `Unit.busy` returns a `Rule`, which is not a `DataObject`, so
`toPlainObject` walks it through its plain-object branch — `Object.entries(value)`.
Every field of `Rule`, `Criterion`, `Criteria` and `Priority` used to be
`#private` and therefore invisible to `Object.entries`, so that branch emitted
`{}`. They are now ordinary properties, so it emits
`{_enabled, _priority, _criteria}`.

`busy` is `null` or a rule either way, and `{}` and `{…}` are equally truthy, so
the renderer behaves identically. It is confined to that one site — the sweep
over the whole DTO found no other.

**The proper fix belongs in Stage 4**: `Unit.busy` should serialise as a rule
identity rather than the rule object, which is both smaller and meaningful.
