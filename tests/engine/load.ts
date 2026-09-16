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
    // Saved *before* the digest is taken, because taking one is not free: its
    // DTO half calls `toPlainObject`, which processes yield and support rules,
    // and `civ1-city`'s `Unsupported` rule destroys a unit a city can no longer
    // feed. Measured the other way round, the file was missing a unit the
    // measurement had just killed, and the loaded game was blamed for it.
    //
    // `createdAt` fixed so two runs of this file produce identical bytes.
    writeFileSync(
      file,
      JSON.stringify(save(defaultGame, { name: 'load-suite', createdAt: 0 }))
    );

    report.atSave = digest();
  }

  if (turn >= then) {
    report.atThen = digest();

    finish();
  }
});

if (mode === 'load') {
  const file_ = JSON.parse(readFileSync(file, 'utf8')) as SaveGame;

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

      resumeGame();

      if (turnInstance.value() >= then) {
        report.atThen = report.atLoad;

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
