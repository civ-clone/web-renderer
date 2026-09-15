// Two games in one process, driven to a turn each, proving they share nothing.
//
// This is the criterion Stage 3 exists for, and the conformance suite cannot
// show it: that suite drives `defaultGame`, deliberately, because running on
// the adopted singletons is what proves the migration changed nothing.
//
// Bundled by `tools/isolation.js` with esbuild, for the same reason as the
// conformance suite — so it resolves the same `.ts` sources the renderer does.

import { Game } from '@civ-clone/civ1-game';
import Player from '@civ-clone/core-player/Player';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import { createRng } from '@civ-clone/core-random';
import registerCiv1PlayerEvents from '@civ-clone/civ1-player/registerEvents';
import registerTurnEvents from '@civ-clone/core-turn-based-game/registerEvents';
import Busy from '@civ-clone/core-unit/Rules/Busy';
import Fortified from '@civ-clone/base-unit-improvement-fortified/UnitImprovements/Fortified';
import Fortify from '@civ-clone/base-unit-action-fortify/Fortify';
import Grassland from '@civ-clone/base-terrain-grassland/Grassland';
import Tile from '@civ-clone/core-world/Tile';
import Warrior from '@civ-clone/base-unit-warrior/Warrior';
import World from '@civ-clone/core-world/World';
import { instance as unitImprovementRegistryInstance } from '@civ-clone/core-unit-improvement/UnitImprovementRegistry';

const checks: [string, () => boolean][] = [];

// The rule-count guard lives in the conformance suite, not here: this file
// imports two event modules, so no `registerRules` has run and every count
// would be zero. There, every plugin is loaded and a missing registration
// shows up as a changed fixture.

const build = (seed: number): Game => {
  const game = new Game({ rng: createRng(seed) });

  registerTurnEvents(game);
  registerCiv1PlayerEvents(game);

  return game;
};

const a = build(1);
const b = build(2);

checks.push(['registries differ', () => a.cities !== b.cities]);
checks.push(['rule registries differ', () => a.rules !== b.rules]);
checks.push(['engines differ', () => a.engine !== b.engine]);
checks.push(['turns differ', () => a.turn !== b.turn]);
checks.push([
  'civ1 registries differ',
  () => a.earthStartTiles !== b.earthStartTiles,
]);

// Entities registered in one are invisible to the other.
a.players.register(new Player(a.rules));
a.clients.register(new SimpleAIClient(a.players.entries()[0]));

checks.push(['a has one player', () => a.players.entries().length === 1]);
checks.push(['b has none', () => b.players.entries().length === 0]);

// Events reach only their own game. A name of its own rather than `turn:start`,
// which would set the real turn machinery going and test something else.
let heard = 0;

a.engine.on('isolation:ping', () => (heard += 1));
b.engine.emit('isolation:ping');

// Captured now, not read in the closure: every check below runs at the end, by
// which point a's own emit has happened too.
const afterBEmitted = heard;

a.engine.emit('isolation:ping');

const afterAEmitted = heard;

checks.push(['b`s event did not reach a', () => afterBEmitted === 0]);
checks.push(['a`s own event did', () => afterAEmitted === 1]);

// Turn state advances independently.
a.turn.increment();
a.turn.increment();

checks.push(['a is on turn 2', () => a.turn.value() === 2]);
checks.push(['b is still on 0', () => b.turn.value() === 0]);

// The random streams are separate.
a.rng();

const aDraws = a.rng.calls();
const bDraws = b.rng.calls();

checks.push(['a drew once', () => aDraws === 1]);
checks.push(['b drew none', () => bDraws === 0]);

// A delayed action completes against the registries it was constructed with.
//
// Its completion used to be a closure bound to `this`, so it wrote to the
// action's own registries. Converting it to a `PendingEffect` handler moved it
// to module scope and six conversions swapped those registries for
// `…Instance` singletons. Nothing in the game noticed — `defaultGame` *is* the
// singletons — and every test with its own registries did: `civ1-unit`'s
// "should clear Fortified when activated" watched `Fortified` land in a
// registry it was not looking at. Game `a` has its own `unitImprovements`, so
// this is the shape that catches it.
const fortifying = ((): { mine: number; singleton: number; error?: string } => {
  const before = unitImprovementRegistryInstance.entries().length;

  try {
    const player = a.players.entries()[0];
    const tile = new Tile(
      0,
      0,
      new Grassland(),
      null as unknown as World,
      a.rules
    );
    const unit = new Warrior(null, player, tile, a.rules);

    new Fortify(
      tile,
      tile,
      unit,
      a.rules,
      a.turn,
      a.unitImprovements
    ).perform();
    (unit.busy() as Busy).process();

    return {
      mine: a.unitImprovements
        .getByUnit(unit)
        .filter((improvement) => improvement instanceof Fortified).length,
      singleton: unitImprovementRegistryInstance.entries().length - before,
    };
  } catch (error) {
    return { mine: 0, singleton: 0, error: (error as Error).message };
  }
})();

checks.push([
  `a delayed action completes into its own registry${
    fortifying.error ? ` (threw: ${fortifying.error})` : ''
  }`,
  () => fortifying.mine === 1,
]);
checks.push([
  'and not into the singleton',
  () => !fortifying.error && fortifying.singleton === 0,
]);

let failed = 0;

checks.forEach(([label, check]) => {
  let ok = false;

  try {
    ok = check();
  } catch (error) {
    ok = false;
  }

  if (!ok) {
    failed += 1;
  }

  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`);
});

console.log(
  `\n${checks.length - failed}/${
    checks.length
  } — two games in one process share nothing`
);

process.exit(failed === 0 ? 0 : 1);
