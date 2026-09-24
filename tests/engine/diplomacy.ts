// Does a game with diplomacy in progress save, load and carry on (#80)?
//
// Every save made after two players met failed to load: the diplomacy classes
// were never registered, so hydration stopped at the first one it met. And
// each of them wrote the whole rule registry into the file and a reference to
// the turn counter, neither of which it should have.
//
// Two processes, as with the load suite, because loading needs an engine that
// has not started a game.
//
//   --save <file>   play to `until`, open a negotiation and a treaty, save
//   --load <file>   load, carry the negotiation on, then play a turn

// Must stay first: seeds `Math.random` before any engine module evaluates.
import { config } from './lib/seed';

import Negotiation from '@civ-clone/core-diplomacy/Negotiation';
import Never from '@civ-clone/core-diplomacy/Expiries/Never';
import { Peace } from '@civ-clone/library-diplomacy/Declarations';
import Player from '@civ-clone/core-player/Player';
import { SaveGame } from '@civ-clone/core-save-game/SaveGame';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import { defaultGame } from '@civ-clone/core-game/defaultGame';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { restoreGame, resumeGame } from '../../src/js/Engine/loadGame';
import { plugins } from '../../src/js/plugins';
import { readFileSync, writeFileSync } from 'fs';
import { registerClasses } from '@civ-clone/core-save-game/registerClasses';
import { registerDiplomacyClasses } from '../../src/js/Engine/diplomacy';
import { save } from '@civ-clone/core-save-game/save';

const mode = process.argv.includes('--load') ? 'load' : 'save';
const file = process.argv[process.argv.indexOf(`--${mode}`) + 1];
const until = 3;

const report: Record<string, unknown> = {};

const typesOf = (objects: object[]): string[] =>
  objects.map((object) => object.constructor.name);

const negotiation = (): Negotiation =>
  defaultGame.interactions
    .entries()
    .find(
      (interaction): interaction is Negotiation =>
        interaction instanceof Negotiation
    )!;

const peace = (): Peace =>
  defaultGame.interactions
    .entries()
    .find((interaction): interaction is Peace => interaction instanceof Peace)!;

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

const fail = (error: Error): void => {
  process.stdout.write(
    JSON.stringify({ error: error.message, stack: error.stack }) + '\n'
  );
  process.exit(1);
};

if (mode === 'save') {
  engine.on('turn:start', (turn: number): void => {
    if (stopped || turn !== until) {
      return;
    }

    const [first, second] = playerRegistryInstance.entries();
    const opened = new Negotiation(first, second, defaultGame.rules);

    defaultGame.interactions.register(opened);

    // Two steps in, so the negotiation is part way through rather than
    // untouched or finished.
    opened.proceed(opened.nextSteps()[0]);
    opened.proceed(opened.nextSteps()[0]);

    defaultGame.interactions.register(
      new Peace(first, second, new Never(), defaultGame.rules)
    );

    const saved = save(defaultGame, { name: 'diplomacy-suite', createdAt: 0 });

    writeFileSync(file, JSON.stringify(saved));

    report.interactions = typesOf(opened.interactions());
    report.nextSteps = typesOf(opened.nextSteps());
    report.carried = saved.entities
      .filter(({ state }) => '_ruleRegistry' in state || '_turn' in state)
      .map(({ type }) => type);

    finish();
  });

  engine.on('engine:start', (): void => {
    engine.registerPlugins(plugins);
    registerClasses(defaultGame);
    registerDiplomacyClasses(defaultGame);
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
    .catch(fail);
} else {
  const saved = JSON.parse(readFileSync(file, 'utf8')) as SaveGame;

  engine.on('turn:start', (turn: number): void => {
    if (!stopped && turn > saved.meta.turn) {
      report.playedOn = turn;

      finish();
    }
  });

  import('../../src/js/plugins')
    .then((): void => {
      restoreGame(
        saved,
        (player: Player): SimpleAIClient => new SimpleAIClient(player)
      );

      const loaded = negotiation();
      const treaty = peace();

      report.interactions = typesOf(loaded.interactions());
      report.nextSteps = typesOf(loaded.nextSteps());
      report.injected = [loaded, treaty].every(
        (interaction) =>
          (interaction as unknown as Record<string, unknown>)._ruleRegistry ===
            defaultGame.rules &&
          (interaction as unknown as Record<string, unknown>)._turn ===
            defaultGame.turn
      );
      report.peaceActive = treaty.active();

      // Carry the negotiation on to its end, as the players would have.
      for (let i = 0; i < 20 && !loaded.terminated(); i++) {
        loaded.proceed(loaded.nextSteps()[0]);
      }

      report.terminated = loaded.terminated();

      resumeGame();
    })
    .catch(fail);
}
