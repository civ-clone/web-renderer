// Does a saved game come back as a game you can carry on playing?
//
// The save suite proves a file round-trips byte-identically. That is not the
// same question. This one goes through the renderer's own load path —
// `src/js/Engine/loadGame.ts`, what the "Load Game" menu item runs — in a
// *second process*, because loading needs an engine that has not started a
// game: plugins register their rules on import, closing over the singleton
// registries, so a save cannot be laid over a game in progress.
//
//   --save <file>   play to `until`, save, then play on to `then`
//   --load <file>   load, then play on to `then`
//
// Two comparisons come out of that. The state right after loading must match
// the state at the moment of saving — a round trip through the real path. And
// playing on from a loaded game must reach the same state as never having
// stopped: replay equivalence, the last open Stage 5 criterion.

// Must stay first: seeds `Math.random` before any engine module evaluates.
import { config } from './lib/seed';

import Player from '@civ-clone/core-player/Player';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import { SaveGame } from '@civ-clone/core-save-game/SaveGame';
import { defaultGame } from '@civ-clone/core-game/defaultGame';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as randomInstance } from '@civ-clone/core-random';
import { instance as turnInstance } from '@civ-clone/core-turn-based-game/Turn';
import World from '@civ-clone/core-world/World';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { restoreGame, resumeGame } from '../../src/js/Engine/loadGame';
import { plugins } from '../../src/js/plugins';
import { readFileSync, writeFileSync } from 'fs';
import { registerClasses } from '@civ-clone/core-save-game/registerClasses';
import { save } from '@civ-clone/core-save-game/save';
import snapshot, { checksum } from './lib/checksum';
import Embark from '@civ-clone/base-unit-action-embark/Embark';
import { Land } from '@civ-clone/library-unit/Types';
import { Trireme } from '@civ-clone/civ1-unit/Units';
import Unit from '@civ-clone/core-unit/Unit';
import { instance as ruleRegistryInstance } from '@civ-clone/core-rule/RuleRegistry';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';

const mode = process.argv.includes('--load') ? 'load' : 'save';
const file = process.argv[process.argv.indexOf(`--${mode}`) + 1];
const until = Number(process.env.LOAD_UNTIL ?? 6);
const then = Number(process.env.LOAD_THEN ?? 8);

// There is no world registry to read the world back from — `World.build()`
// hands it to the `Built` rules and nothing else — and a loaded game never
// builds one. Every tile knows its world, and every player has a `PlayerWorld`
// over it, so that is the way back to it from saved state alone.
const world = (): World =>
  playerWorldRegistryInstance.entries()[0].tiles()[0].tile().map();

const digest = (): string =>
  checksum(snapshot(turnInstance.value(), randomInstance.calls(), world(), 0));

const report: Record<string, string> = {};

// Total build progress across every city, which is the cheapest question that
// catches a loaded game quietly not working. `PlayerTreasury._yield` was
// written as `{ $class: 'Gold' }`, three packages declare a class called
// `Gold`, and the reference came back as a terrain feature — so the treasury
// lookup threw inside `ProcessYield` and a loaded game applied no production,
// food or trade. The state round-tripped perfectly; only playing showed it.
const production = (): number =>
  defaultGame.cityBuilds
    .entries()
    .reduce(
      (total: number, cityBuild): number =>
        total + cityBuild.progress().value(),
      0
    );

// The city names still to be handed out. A fresh boot fills the pool again,
// so a loaded game that has not taken the used names back out would name its
// next city after one already standing, the capital's first (#120).
const namePool = (): string =>
  defaultGame.cityNames
    .entries()
    .map(
      (cityName): string =>
        `${cityName.civilization()?.name ?? '-'}:${cityName.name()}`
    )
    .join(',');

// Any name handed out twice in this game, counting the names restored from the
// save and those of cities since destroyed. Empty is the answer wanted. Keyed
// by civilization as well, because two civilizations can each have an Athens,
// and founding both is not a repeat.
const repeatedCityNames = (): string =>
  defaultGame.cityNames
    .taken()
    .map(
      (cityName): string =>
        `${cityName.civilization()?.name ?? '-'}:${cityName.name()}`
    )
    .filter((name, index, names): boolean => names.indexOf(name) !== index)
    .join(',');

// Every ship's cargo, as `<ship>:<unit>`, asked of the ship itself. A ship's
// registries used to be saved as plain arrays, so after a load this threw, and
// so did the turn of any computer player that owned a ship (#228).
const cargo = (): string =>
  defaultGame.transports
    .entries()
    .map((manifest) => manifest.transport())
    .filter((ship, index, ships) => ships.indexOf(ship) === index)
    .flatMap((ship) =>
      ship.cargo().map((unit: Unit): string => `${ship.id()}:${unit.id()}`)
    )
    .sort()
    .join(',');

// A Trireme with a land unit aboard, for the first land unit that has an empty
// sea tile beside it. Put there directly, as the computer players don't build
// one this early; they move it, and the unit, as they play on.
const launchShip = (): string => {
  for (const unit of unitRegistryInstance.entries()) {
    if (unit.destroyed() || !(unit instanceof Land)) {
      continue;
    }

    const sea = unit
      .tile()
      .getNeighbours()
      .find(
        (tile) =>
          tile.isWater() && unitRegistryInstance.getByTile(tile).length === 0
      );

    if (!sea) {
      continue;
    }

    const ship = new Trireme(null, unit.player(), sea, ruleRegistryInstance);

    unitRegistryInstance.register(ship);
    unit.action(new Embark(unit.tile(), sea, unit, ship, ruleRegistryInstance));

    return `${ship.id()}:${unit.id()}`;
  }

  return 'no land unit beside the sea';
};

// Errors logged while playing on: a computer player's turn that throws is
// caught and logged, and the game carries on without it.
let errors = 0;
const logError = console.error.bind(console);

console.error = (...args: unknown[]): void => {
  errors += 1;
  logError(...args);
};

// The same loop-stopper the other suites use: once stopped, the turn events
// that would drive the game on are dropped rather than the process being
// killed mid-turn.
let stopped = false;
const LOOP = ['player:turn-end', 'player:turn-start', 'turn:end', 'turn:start'];
const emitDirect = engine.emit.bind(engine);

engine.emit = (event: string, ...args: any[]): void => {
  if (stopped && LOOP.includes(event)) {
    return;
  }

  emitDirect(event, ...args);
};

const finish = (): void => {
  stopped = true;

  process.stdout.write(JSON.stringify(report) + '\n');
  process.exit(0);
};

engine.on('turn:start', (turn: number): void => {
  if (stopped) {
    return;
  }

  if (mode === 'save' && turn === until) {
    report.shipLaunched = launchShip();

    // Saved *before* the digest is taken, because taking one is not free: its
    // DTO half calls `toPlainObject`, which processes yield and support rules,
    // and `civ1-city`'s `Unsupported` rule destroys a unit a city can no longer
    // feed. Measured the other way round, the file was missing a unit the
    // measurement had just killed, and the loaded game was blamed for it.
    //
    // `createdAt` fixed so two runs of this file produce identical bytes.
    const saved = save(defaultGame, { name: 'load-suite', createdAt: 0 });

    writeFileSync(file, JSON.stringify(saved));

    // The stream the file says to resume, against the one `seed.ts` put the
    // generator on.
    report.rngAtSave = `${saved.rng.seed}:${saved.rng.calls}`;
    report.rngPlayed = `${config.seed}:${randomInstance.calls()}`;

    report.atSave = digest();
    report.productionAtSave = String(production());
    report.namePoolAtSave = namePool();
    report.cargoAtSave = cargo();

    errors = 0;
  }

  if (turn >= then) {
    report.errorsThen = String(errors);
    report.atThen = digest();
    report.productionAtThen = String(production());
    report.repeatedCityNamesAtThen = repeatedCityNames();
    // Drawn last, once everything else is measured: two games on different
    // streams can agree on state for a few turns and still differ here.
    report.nextDrawAtThen = String(randomInstance());

    finish();
  }
});

if (mode === 'load') {
  const file_ = JSON.parse(readFileSync(file, 'utf8')) as SaveGame;

  // Every Trireme as a save from before #228 holds it: its two registries
  // written in as state, an empty array and the rules as markers. Loading has
  // to put the game's own back either way.
  file_.entities
    .filter(({ type }) => type === 'Trireme')
    .forEach(({ state }) => {
      state._transportRegistry = [];
      state._transportRuleRegistry = [{ $busy: 'Yield' }];
    });

  // No `engine.start()`: that is what generates a world. Plugins are imported
  // for their rules, exactly as the worker does before handing over.
  import('../../src/js/plugins')
    .then((): void => {
      restoreGame(
        file_,
        (player: Player): SimpleAIClient => new SimpleAIClient(player)
      );

      // Before resuming: the comparison is with the state that was saved, and
      // resuming hands the turn straight back to a client, which starts moving.
      report.atLoad = digest();
      report.productionAtLoad = String(production());
      report.namePoolAtLoad = namePool();
      report.cargoAtLoad = cargo();

      errors = 0;

      resumeGame();

      if (turnInstance.value() >= then) {
        report.atThen = report.atLoad;
        report.repeatedCityNamesAtThen = repeatedCityNames();

        finish();
      }
    })
    .catch((error: Error): void => {
      process.stdout.write(
        JSON.stringify({ error: error.message, stack: error.stack }) + '\n'
      );
      process.exit(1);
    });
} else {
  engine.on('engine:start', (): void => {
    engine.registerPlugins(plugins);
    registerClasses(defaultGame);
  });

  engine.on('engine:start', (): void => {
    new Array(config.players).fill(0).forEach((): void => {
      const player = new Player();

      playerRegistryInstance.register(player);
      clientRegistryInstance.register(new SimpleAIClient(player));
    });
  });

  engine.setOption('players', config.players);
  engine.setOption('height', config.height);
  engine.setOption('width', config.width);
  engine.start();

  import('../../src/js/plugins')
    .then(() => engine.emit('plugins:load:end'))
    .catch((error) => {
      process.stderr.write(`${error?.stack ?? error}\n`);
      process.exit(1);
    });
}
