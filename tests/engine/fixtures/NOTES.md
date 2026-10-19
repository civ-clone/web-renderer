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

## Accepted change: citizen moods (#277)

civ1-city-happiness's `citizens` AdditionalData on `City` adds each city's
citizen moods, and the moods after each Happiness/Unhappiness yield, to the
DTO. Every checksum is identical, and the object count is unchanged. Only the
DTO bytes and hash moved:

| | Before | After |
| - | ------ | ----- |
| turn 10 | `bytes 652789, hash 2b19f863` | `bytes 653554, hash 4dee883f` |
| turn 50 | `bytes 10168507, hash 023dc808` | `bytes 10173317, hash 37de25b6` |

## Accepted change: start positions (#191, #232)

civ1-world's `pick-start-tile` no longer skips candidates while filtering out
those within 4 of a used start square (measured with `civ1Distance`), and,
as in v474.05, only starts a civilization on a landmass with at least 32
Grassland, Plains or River tiles. The world is identical. At turn 1 the only
differences are the four Settlers' positions (and the hashes and DTO sizes that
follow from them). Entity counts and random calls are unchanged. Everything
after turn 1 moves with them.

## Accepted change: action ids (#306)

simple-ai-client's `moveUnit` no longer asks for a unit's actions on a tile
beyond its neighbours when a step of its path is blocked. No kind of `Move` can
be offered there, so the unit does exactly what it did before, but each of those
calls used to create a `GoTo` action, which used up a `DataObject` id. The
engine-state checksums at turns 1, 10 and 50 are unchanged, as are the DTO's
object count and byte size; only the turn-50 DTO hash moves. Compared with
`CONFORMANCE_DUMP` before and after, the turn-50 DTOs are identical once ids are
renumbered in order of first appearance.

(`CONFORMANCE_DUMP` serialises every player, city and unit at the last turn
before the snapshot is taken, which itself uses up ids and runs rules, so a run
with it set never matches the fixture. Compare two dumped runs with each other,
not with the fixture.)

The city-keyed registry indexes that arrived alongside it (#308) change nothing
here.

## Accepted change: action ids again (#311)

simple-ai-client's `shouldAttack` now works out each player's military power
once a turn rather than on every call. Each `attack()` and `defence()` it no
longer makes creates `Yield`s, which used up `DataObject` ids. In this game no
decision changes: the engine-state checksums at turns 1, 10 and 50 are
unchanged, and the turn-50 DTOs dumped before and after are identical once ids
are renumbered in order of first appearance. Only the turn-50 DTO hash moves.
(In longer games the cache does change some decisions; the arena run on #311
found nothing worse.)

## Accepted change: player action ids (#314)

core-player's `mandatoryAction()` and `hasMandatoryActions()` now stop at the
first `Action` rule that offers a mandatory action, civ1-player's end-turn
rule asks `hasMandatoryActions()` rather than listing every other mandatory
action, and core-strategy-ai-client's `takeTurn` asks `mandatoryAction()` once
per action rather than `hasMandatoryActions()` first. The action found is the same, but far fewer `PlayerAction`s are built,
each of which used up a `DataObject` id. The engine-state checksums at turns 1,
10 and 50 are unchanged, and the turn-50 DTOs dumped before and after are
identical once ids are renumbered in order of first appearance. The DTO hashes
at turns 1, 10 and 50 move, and the turn-50 DTO is a little smaller (shorter
ids).

## Accepted change: yields ids (#315)

civ1-city-happiness's turn-start rule now works out each city's yields once
for both its disorder and its celebration checks, and simple-ai-client's
disorder, martial-law and purchase checks share one `City#yields()` result
where they asked for it again with nothing changed in between. Each call
creates `Yield`s, which used up `DataObject` ids. The engine-state checksums at
turns 1, 10 and 50 are unchanged, and the turn-50 DTOs dumped before and after
are identical once ids are renumbered in order of first appearance. The DTO
hashes at turns 10 and 50 move, and the turn-50 DTO is a little smaller
(shorter ids).

## Accepted change: rule counts (#138)

core-city 0.1.22 adds the `TileWorked` and `TileReleased` rule types, fired by
`WorkedTileRegistry` and turned into `city:tile-worked` and
`city:tile-released` engine events by civ1-city, so the frontend can be sent a
tile whenever the tiles a city works change. The rule totals at turns 1, 10 and
50 rise by two (one rule of each type) and nothing else moves: the engine-state
checksums, the random-call counts and the DTO hashes are unchanged.

## Accepted change: rule counts (#400)

civ1-city adds `civ1-city:city/grow/emit`, `civ1-city:city/shrink/emit` and
`civ1-city:city/food-exhausted/emit`, which raise the `city:grow`,
`city:shrink` and `city:food-storage-exhausted` engine events. The rule totals
at turns 1, 10 and 50 rise by three (one `Grow`, one `Shrink` and one
`FoodExhausted`), and nothing else moves: the engine-state checksums, the
random-call counts and the DTO hashes are unchanged.

## Accepted change: diplomacy as v474.05 holds it (#427, #71)

civ1-diplomacy's negotiation map is rewritten as v474.05's meeting with a king,
two computer players settle war or peace by v474.05's test, and simple-ai-client
no longer breaks a peace on the map. Meetings between computer players now
happen every four turns while their units are next to each other, trade
advances and sign or cancel treaties, so play changes from the first contact: the
engine-state checksum and the DTO hash at turn 50 move, and turns 1 and 10 are
unchanged apart from the rule counts. The rule counts change with the new and rewritten rules:
`Step` falls from 33 to 16, `Resolved` rises from 3 to 6, `Interaction`,
`Detonated` and `TurnStart` each rise by one, and civ1-diplomacy's two
`MayNegotiate` and civ1-power's four `Rank` and one `MilitaryStrength` rules are
new. The arena (seeds 1–40 and 41–80, 80 × 300 turns each, all seats one AI)
shows no regression in power, score, cities or advances, and fewer cities lost
on both seed sets.

## Accepted change: garrisons sized to the enemies close by (#423)

simple-ai-client's Civ1 cities now build defenders up to a quarter of their
size, plus one with an enemy unit next to them and at least as many as the
enemy attackers within 3 tiles (up to 3), keep up to size / 4 + 1 (size / 3 + 1
when threatened), and release a spare fortified defender one turn in eight.
The rule counts are unchanged. The turn-1 checksums are unchanged. The turn-10
engine state is unchanged but its DTO hash moves.
Turn 50's state and DTO move, since cities hold and build different garrisons.
The arena (this AI against #434's, seeds 1–40 and 41–80, 80 × 300 turns) shows
cities lost −0.23 on both seed sets and no regression in power or score.

## Accepted change: computer players ferry units overseas (#211)

simple-ai-client's computer players now ferry explorers and Settlers (with an
escort) to other landmasses, build a transport for passengers waiting in a port,
and no longer put land units aboard an exploring ship for no reason. The engine
rules are unchanged (rule counts included), as is turn 1. Turns 10 and 50 move
in state and DTO: land units next to the exploring Trireme no longer board it,
which changes early moves, and later ships and passengers act differently once a
player has explored its own landmass. The arena (this AI against #439's, seeds 1–40 and
41–80, 80 × 300 turns) shows cities overseas up on both seed sets, cities and
power up or level, and the costs raised as #440 and #441.
