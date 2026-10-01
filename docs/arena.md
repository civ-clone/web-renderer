# The AI arena

`tools/arena.js` plays seeded headless games in which some seats run the
**baseline** `simple-ai-client` and the others the **candidate**, then reports
whether the candidate played better, with the spread across seeds. The
conformance suite proves a change leaves play identical; the arena is for AI
changes that are meant to change play (#202).

```sh
npm run arena -- --candidate fix/some-branch              # 20 games, 150 turns
npm run arena -- --baseline d660d9b --candidate fix/a --games 6
npm run arena -- --candidate ../my-simple-ai-client-copy --out arena.json
npm run arena -- --self-check                             # baseline vs itself
```

`npm run arena` regenerates `src/js/plugins.ts` first, as `test:conformance`
does. `node tools/arena.js --help` lists every option.

## Variants

A variant is a `simple-ai-client` source tree. `--baseline` and `--candidate`
each take a git ref of the `simple-ai-client` checkout (`--checkout`, by
default the sibling of `web-renderer`), a path to a directory, or
`working-tree` for the checkout as it is on disk, uncommitted changes
included.

- The default baseline is the commit `pnpm-lock.yaml` pins.
- The default candidate is `working-tree`.

Each variant is copied into a scratch directory: a ref with `git archive`, a
directory or the working tree without its `node_modules` and `.git`. Nothing
is installed, and the copy of `simple-ai-client` in `node_modules` is never
used, so `civ sync`ing a branch there doesn't affect the arena.

Both variants must be at or after `d660d9b`, the first commit whose
`SimpleAIClient` takes a `StrategyRegistry` as its last constructor argument.
The arena refuses anything older.

## How two AIs share one game

Both variants are bundled into one process. The bundle contains two copies of
the AI and one copy of everything else, so both play with the same `Unit`,
`City` and registries:

- The variants' imports of `@civ-clone/*` resolve to web-renderer's
  `node_modules` through esbuild's `nodePaths`.
- `tests/engine/arena.ts` is `tests/engine/run.ts` with the seats swapped. It
  uses the same seeding, the same plugin list and the same stop at
  `turn:start`.
- The installed package's line in the plugin list is replaced by each
  variant's `registerRules` and `registerStrategies`, in the same position.
  Each variant's rules find their client with `instanceof` that variant's
  class, so they only reach that variant's seats.
- Neither variant's `index` is imported.
- Each seat is that variant's `SimpleAIClient`, given a `StrategyRegistry`
  filled from that variant's `createStrategies(dependenciesFor(game))`. The
  registry is built once per game and shared by the variant's seats, as the
  game-wide registry is in a normal game. The constructor argument's position
  is read from the variant's source.

After bundling, the runner reads esbuild's metafile and refuses to play if
any package is bundled from two directories, if the installed
`simple-ai-client` is in the bundle, or if either variant is missing.

## Seats and seeds

In game `g`, seat `s` is the candidate if `(g + s) % 2 == 0`. `--games N`
plays seeds `1, 1, 2, 2, …`, so games `2k` and `2k+1` share a map and swap
every seat. Every start position is played once by each AI. `--seeds 3,7,9`
plays each listed seed twice in the same way. The seed list, and so the whole
run, is deterministic.

## What is measured

Per player, at the start of the last turn:

| Metric                                                                                                               | What it counts                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `rating`, `ratingGold`, `ratingAdvances`, `advanceTiers`, `score`, `scoreCitizens`, `scoreWonders`, `scorePollution` | At the end. See [Rating](#rating) and [Score](#score).                                                         |
| `cities`, `population`, `advances`, `units`, `navalUnits`, `gold`                                                    | Held at the end. Population is the sum of city sizes. Advances are the ones `PlayerResearch.complete()` lists. |
| `unitsCreated`, `navalUnitsCreated`                                                                                  | Units that appeared during the game (`unit:created`): built, or from a hut. The starting units aren't counted. |
| `unitsLost`, `unitsDefeated`                                                                                         | Units lost in combat, and enemy units beaten (`unit:defeated`).                                                |
| `unitsLostAtSea`                                                                                                     | Units lost at sea (`unit:lost-at-sea`): a Trireme away from the coast, or an aircraft out of fuel.             |
| `wondersStarted`                                                                                                     | Wonders a city was building at a turn's start, each city's each Wonder counted once, finished or not.          |
| `wondersBuilt`, `improvementsBuilt`                                                                                  | Wonders and other city improvements finished (`city:building-complete`). The founding Palace isn't counted.    |
| `firstCityTurn`                                                                                                      | The turn the player founded its first city (`city:created`), or `--turns` if it never did.                     |
| `noCityAtTurn10`                                                                                                     | 1 if the player held no city at the start of turn 10 (of the last turn, in a shorter game).                    |
| `explored`, `exploredLand`, `exploredSea`                                                                            | Tiles in the player's map.                                                                                     |
| `disorderTurns`, `disorderCityTurns`                                                                                 | Turns with any city in civil disorder, and city-turns in disorder, counted from `city:civil-disorder`.         |
| `specialists`, `specialistTurns`                                                                                     | Citizens not working a tile (Entertainers and other specialists) at the end, and summed over the turn starts.  |
| `martialLaw`                                                                                                         | Unhappy citizens made content by units in their city (the engine's `MartialLaw` yields), at the end.           |
| `tax`, `science`, `luxuries`                                                                                         | The trade rates, in percent, at the start of the last turn.                                                    |
| `meanLuxuries`, `rateChanges`                                                                                        | The luxury rate averaged over the turn starts, and how many turn starts had new rates.                         |
| `eliminated`                                                                                                         | 1 if the player was defeated.                                                                                  |
| `loopGuardTurns`, `loopGuardHits`                                                                                    | The AI's action limit was reached (`actionLimitReached`).                                                      |
| `unitsSkipped`, `skipTurns`                                                                                          | A unit threw and was skipped for the turn (`actionFailed`).                                                    |
| `unhandledActions`                                                                                                   | The turn ended at an action no strategy handled, other than `EndTurn`.                                         |

The last three groups are counted by wrapping those methods on each client,
so the counting doesn't depend on console output, and the AI runs exactly as
it would have. The AI's console output is silenced unless `--verbose`.

### Rating

`rating` comes first in the report: one overall answer for a change that
trades one metric for another, such as less gold for more advances. It's
`score + floor((treasury + researchInvested) / 10)`, worked out by
`tests/engine/lib/rating.ts` (tested by `npm run test:rating`) so that the
engine's measure (#149) can lift it. The treasury and the research share the
one `floor`, so moving trade between tax and science can't move it by
rounding; `ratingGold` and `ratingAdvances`, each floored on its own, are
reported to read it by, and can be one short of adding up to it:

| Term             | Value                                                                                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `score`          | Civ1's Civilization Score, below.                                                                                                                                                                                                                                   |
| `ratingGold`     | `floor(treasury / 10)`.                                                                                                                                                                                                                                             |
| `ratingAdvances` | `floor(researchInvested / 10)`: the bulbs the ruleset's `Cost` rules charge for each advance the player holds, at the number it knew before it, plus its progress towards the next. An advance from a hut, a trade or a conquest counts at what it would have cost. |

Gold and advances are in one currency: a trade point becomes one gold or one
bulb, so moving the rates between tax and science doesn't move the rating by
itself. Its limits:

- Gold held is a stock and research is a running total. Gold spent, on an
  improvement or a hurried unit, leaves `ratingGold`, and only comes back
  through what it bought, if the score counts that. Bulbs are never lost.
- Civ1 charges more for each advance than the last, so `ratingAdvances` grows
  with the square of the advances held. Later in a game it outweighs the score
  and the treasury.
- Units, improvements and Marketplace or Library multipliers aren't counted.
  #149's ranking counts units by their cost, and might be added later.
- It's the same yardstick for every player. Weighting advances by how much a
  particular leader wants them belongs to that leader's research choices
  (#157), not to a measure that has to compare two AIs.

`advanceTiers` is reported beside it, but isn't part of it. It's the sum of
each held advance's tier, the length of its longest chain of prerequisites
counting itself, from the ruleset's `Requirements` rules: Alphabet 1, Code of
Laws 2, Monarchy 3, Feudalism 4, Chivalry 5. It weights advances by depth in
the tree rather than by cost.

### Score

`score` is Civ1's Civilization Score, as the score screen will show it. It
isn't the engine's: the engine has no score yet (#149). It counts, as Civ1 v474.05 does (OpenCivOne's decompile of the score screen,
`Overlay_20` `F20_0000_0ca9_ShowCivilizationScorePopup`; _Rome on 640K a Day_
pp325–328 agrees):

| Term             | Points                                                                                                         | Here                                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `scoreCitizens`  | 2 per happy citizen, 1 per content citizen or specialist: each city's size + happy − unhappy.                  | `civ1-city-happiness`'s `calculateCitizenState` over each city's yields, at the player's own trade rates. |
| `scoreWonders`   | 20 per Wonder the player's cities hold, obsolete or not.                                                       | `core-wonder`'s `WonderRegistry`.                                                                         |
| `scorePollution` | −10 per polluted tile in the whole world, the same for every player.                                           | Tiles with a `Pollution` improvement. Nothing in the engine pollutes a tile yet, so it is 0.              |
| Future Tech      | 5 per Future Technology.                                                                                       | 0: the engine has no Future Technology (#128).                                                            |
| Peace            | 3 per turn since the last fight between two civilizations, after AD 1, at most 100; the same for every player. | 0: the engine keeps no count of turns of world peace.                                                     |
| Spaceship        | Once it lands: habitation modules × chance of success (%) ÷ 2, so 50 per module at 100%.                       | 0: no computer player builds spaceship parts, and an arena game ends long before one could land.          |

The total is never below 0. Civ1's world-conquest bonus replaces the total
when it's higher; an arena game always plays to `--turns`, so it isn't
counted.

One difference: when v474.05 counts the citizens for the score, it sets the
player's luxury rate to 40% for the count and puts it back afterwards. The
arena counts them at the rates the player chose, since how the AI sets its
rates is part of what's being compared.

## Reading the report

The runner prints a row per seat per game, then a summary. For each metric it
shows the baseline's and the candidate's mean, standard deviation and range
over every seat they played. It also shows the **paired** difference: the
candidate's result from a seat minus the baseline's from the same seat of the
same map, with its standard error and `t`. Rows with `|t| >= 2` are marked
`better` or `worse`, or `higher`/`lower` for the unit counts that have no
better direction.

The `t` is a guide, not a test. The seats of one game play against each other,
so they aren't independent. Use more seeds before trusting a small effect.

`--out file.json` writes everything: the variants, the bundle check, every
game's per-seat results and the summary.

## Self-check

`--self-check` plays the baseline against a second copy of itself. It fails
unless both of these hold:

1. **The conformance fixture is reproduced.** A game with the fixture's
   settings (seed 1, 50 turns, 4 players, 60×40), seated alternately with the
   two copies, gives the checksums in `tests/engine/fixtures/baseline.json`.
   This shows the harness changes no play. If the fixture itself is stale for
   the tree, `npm run test:conformance` fails too.
2. **Every paired difference is exactly zero.** Two copies of the same AI
   play the same game from both seatings, so a seat's result doesn't depend
   on which copy sat in it.

## Speed

A game is one child process. `--jobs` (default: half the CPUs, at most 4) run
at once. Checksums are only computed for the self-check's conformance game.
