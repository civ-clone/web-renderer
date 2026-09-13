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

The checksum is the deliberately narrow Stage 0 subset described in
[`../../../docs/engine-serialisation/05-engine-plan.md`](../../../docs/engine-serialisation/05-engine-plan.md):
entity id, type, and a hand-listed set of scalars. It is **not** a complete
state hash. Widen it in Stage 4, once `toState()` exists, and regenerate.

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
