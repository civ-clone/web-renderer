# Soak runs

`tools/soak.js` plays whole headless games of any plugin set, on any grid, with
either kind of player, several seeds at once, and fails if any game went wrong
(#1008). The conformance suite proves one game of the default set plays exactly
as before; a soak shows a set can play a game at all, start to finish, without
errors. It is how a new rule set (Civ2's, first) is shown to run before the
renderer offers it.

```sh
npm run soak -- --set civ1 --clients end-turn --games 8 --until-game-over
npm run soak -- --grid staggered-iso --games 8 --turns 150
npm run soak -- --set civ2 --clients end-turn --forbid-prefix civ1- --until-game-over
```

`npm run soak` regenerates `src/js/pluginSets.ts` first, as `test:conformance`
does. `node tools/soak.js --help` lists every option.

## Options

| Option                                             | Default           |                                                                                                                                                                                                                                      |
| -------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--set <id>`                                       | the default set   | A set from `src/js/pluginSets.ts`, loaded as the worker loads it.                                                                                                                                                                    |
| `--grid <topology>`                                | `square`          | `square`, `staggered-iso` or `hex-odd-r`. The last two need an even `--height`.                                                                                                                                                      |
| `--clients <kind>`                                 | `simple-ai`       | `simple-ai`, civ.one's computer players, or `end-turn`, players that end every turn without doing anything, so the set's own rules play the game alone. Players spawned during the game, the barbarians included, get the same kind. |
| `--games <n>` / `--seeds <a,b,…>`                  | 4                 | Seeds 1 to n, or these.                                                                                                                                                                                                              |
| `--turns <n>`                                      | 50                | Play to turn n. With `--until-game-over`, the limit: 1000 unless given.                                                                                                                                                              |
| `--until-game-over`                                |                   | Play until the game has a result (core-turn-based-game's `GameResultRegistry`). A game still going at the limit fails.                                                                                                               |
| `--forbid-prefix <p>`                              |                   | The isolation probe: once the set has loaded, list every rule id starting with `p`, and fail the game, before it starts, if there are any. Repeatable.                                                                               |
| `--players`, `--width`, `--height`, `--difficulty` | 4, 60, 40, `King` | As the conformance game.                                                                                                                                                                                                             |
| `--jobs <n>`                                       | half the CPUs     | Games at once, each a process of its own.                                                                                                                                                                                            |
| `--timeout <seconds>`                              | 1800              | Per game.                                                                                                                                                                                                                            |
| `--allow-errors`                                   |                   | Don't fail a game for errors it logged and carried on from.                                                                                                                                                                          |
| `--json <file>`                                    |                   | Every game's report, as below.                                                                                                                                                                                                       |

## What it reports

One line per game, with the counts of what happened in it under it (below),
then the counts for all the games together, and `PASS` or `FAIL` and the wall
time:

```
seed 1     ok     retirement turn 421 (2020)    last turn 422  (2021 )  282.9   ms/turn  0   errors  119.4s
           governments (player turns): Despotism 896, Anarchy 19, Monarchy 466, Communism 13, Republic 290; changes 14, revolutions 7
           treaties: ceasefire 0, peace 11, alliance 3, war 14
           units built 713: air 0, naval 47, missile 0, nuclear 0, trade 92, agent 14
           space: Apollo 0, parts 0, launched 0, arrived 0
           barbarians: raids at sea 0, uprisings 0, from huts 0, landings 0, cities taken 0, ransoms 0
           civil wars 0, global warmings 0, meltdowns 0, respawns 0
```

- **The ending**: its route (`retirement` for the calendar's end or a player
  retiring, `conquest`, `spaceship`, `destroyed`), turn and year, or how the
  run stopped without one: `turns` (it reached `--turns`), `turn-limit` (it
  reached the limit while playing until game over) or `isolation`. The JSON
  keeps the result's own reason (`date`, `retired`, …) and its winner beside
  the route.
- **The last turn** started, and its year. The run stops as a turn starts, so
  the turns played are one fewer. A game that ends with nobody to keep playing
  carries on, so the last turn is the one after the ending.
- **Milliseconds per turn**, the mean over the turns played, the set's loading
  left out.
- **Errors**: everything written to `console.error`, which is where the engine
  and the AI report the failures they catch and carry on from. Any error fails
  the game unless `--allow-errors`. The JSON keeps the first five, and counts
  the AI's failed actions and action-limit hits besides.

A game also fails if its process exits with an error (the last lines of its
stderr are printed), produces no report or runs out of time.

The **counts** under each game's line (M2e) are summed over its players. The
JSON's `run.counters` has them per player (`players`, barbarians and
civilizations that came back included) and for the game (`game`).
`tests/engine/lib/counters.ts` counts them from the engine's events and
state, by mechanism, never by a rule set's name, so they mean the same under
any set:

| Count                                                                                                 | From                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `governmentTurns`                                                                                     | Each player's government, by class, at every turn's start.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `governmentChanges`, `revolutions`, `governmentCollapses`                                             | `player:government:changed` after the player's first turn, those into Anarchy, and `player:government:collapsed`.                                                                                                                                                                                                                                                                                                                                                                                             |
| `treaties`                                                                                            | Each ceasefire, peace, alliance and war declaration as it is made (the `InteractionRegistry`'s `register`, watched), for each of its players and once for the game. An alliance counts as an alliance only, though its class extends `Peace`, and so does the peace made with it in the same call, where there was none (`makeAlliance` makes peace first): a peace is counted only once the call that made it is over, unless an alliance between the same players came with it. A sham peace isn't counted. |
| `unitsBuilt`, `unitsBuiltByKind`                                                                      | Units a city finished (`city:building-complete`), and of those: `air` and `naval` by type; `missile`, a unit spent by its own attack (`SingleUse`: Civ2's Cruise Missile and Nuclear Missile, not Civ1's Nuclear); `nuclear`, a unit that detonates (`Detonates`, Civ1's Nuclear too); `trade` (`TradeMissions`) and `agent` (`DiplomaticMissions`). A unit can be of several kinds.                                                                                                                          |
| `apolloBuilt`, `wondersBuilt`                                                                         | `wonder:built`; Apollo by its class, `ApolloProgram`.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `spaceshipParts`, `spaceshipArrivals`                                                                 | `player:spaceship:part-built`, `player:spaceship:landed`.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `spaceshipsLaunched`, `spaceshipsArrived`                                                             | The player's spaceships at the end: launched, and landed successfully.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `barbarianRaidsAtSea`, `barbarianUprisings`, `barbarianLandings`, `barbarianRansoms`, `barbarianHuts` | The `barbarians:*` events, and huts whose action was `Barbarians`.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `citiesTakenByBarbarians`                                                                             | `city:captured` by a barbarian player.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `civilWars`, `globalWarmings`, `nuclearMeltdowns`, `respawns`                                         | `player:civil-war`, `world:global-warming`, `city:nuclear-meltdown`, `player:respawned`.                                                                                                                                                                                                                                                                                                                                                                                                                      |

Each event-driven count is one line of a table in `counters.ts`. Civil war
(#125) and global warming (#365) are in no rule set yet, so nothing emits
their events and they count 0; when the engine gains one, its event goes in
its line. The counts only listen and read, so a counted game plays as one that
isn't, and they are imported only once the set has loaded, so the conformance
run never has them.

## How it works

Each game is `tests/engine/run.ts`, the conformance game, bundled once and run
in a process per seed with `CONFORMANCE_CONFIG` set. `run.ts` takes these
options beside the conformance game's own (`tests/engine/lib/seed.ts`'s
`Options`):

| Key              |                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------- |
| `set`            | The set's id, or the default. An unknown id fails, naming the sets there are.                                 |
| `grid`           | A topology id, set as the engine's `topologyId` option. Unset, the engine's default.                          |
| `clients`        | `simple-ai` or `end-turn` (`tests/engine/lib/EndTurnClient.ts`, an `AIClient` whose `takeTurn` does nothing). |
| `untilGameOver`  | Play until the game has a result, with `turns` as the limit.                                                  |
| `forbidPrefixes` | Rule id prefixes the isolation probe looks for.                                                               |
| `report`         | Add the `run` report to the result document. Any of these options turns it on.                                |

With none of them the run is exactly the conformance game: the same imports in
the same order, no topology option set, and a result document without a `run`
report, so the fixture still matches it. The report's modules are imported
only after the set has loaded, for the same reason.

The self-test, `npm run test:soak` (part of `npm test`), plays Civ1 with
end-turn players to turn 20 and to the game's end, checks a forbidden
prefix fails the game, and that a game's counts are reported.
