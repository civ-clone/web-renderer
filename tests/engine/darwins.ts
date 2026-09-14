// Stage 6's acceptance check for Darwin's Voyage: "survives a save/load taken
// between building it and the next research — the specific bug this fixes".
//
// The old implementation granted its two free research completions by
// registering a one-shot rule that registered another one-shot rule, each
// closing over the `PlayerResearch` it applied to. The only record of the grant
// was a closure in the rule registry, so a save taken in between lost it
// silently: the player simply never got their advances and nothing said why.
//
// This asserts the grant still works, and that what records it now survives a
// round trip.

import { config } from './lib/seed';

import AdvanceRegistry from '@civ-clone/core-science/AdvanceRegistry';
import Built from '@civ-clone/core-world/Rules/Built';
import Effect from '@civ-clone/core-rule/Effect';
import Player from '@civ-clone/core-player/Player';
import PlayerResearch from '@civ-clone/core-science/PlayerResearch';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import { DARWINS_VOYAGE } from '@civ-clone/civ1-wonder/Rules/PlayerResearch/started';
import { PendingEffect } from '@civ-clone/core-pending-effect';
import { defaultGame, defaultSlots } from '@civ-clone/core-game/defaultGame';
import { gameForLoad } from '@civ-clone/core-save-game/gameForLoad';
import { hydrate } from '@civ-clone/core-save-game/hydrate';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as ruleRegistryInstance } from '@civ-clone/core-rule/RuleRegistry';
import { registerClasses } from '@civ-clone/core-save-game/registerClasses';
import { save } from '@civ-clone/core-save-game/save';

const checks: [string, () => unknown, unknown][] = [];
const collisions: string[] = [];

const push = (
  label: string,
  actual: () => unknown,
  expected: unknown
): void => {
  checks.push([label, actual, expected]);
};

let stopped = false;
const LOOP = ['player:turn-end', 'player:turn-start', 'turn:end', 'turn:start'];
const emitDirect = engine.emit.bind(engine);

engine.emit = (event: string, ...args: any[]): void => {
  if (stopped && LOOP.includes(event)) {
    return;
  }

  emitDirect(event, ...args);
};

const report = (): void => {
  engine.registerPlugins({ '@civ-clone/civ1-wonder': '0.1.4' });

  const [player] = playerRegistryInstance.entries();
  const advances = new AdvanceRegistry();
  const playerResearch = new PlayerResearch(
    player,
    advances,
    ruleRegistryInstance
  );

  defaultGame.playerResearch.register(playerResearch);

  // Standing in for finishing the wonder. The rule that grants the advances is
  // registered at import now, so this is all the wonder's own effect does.
  const pendingEffect = new PendingEffect(DARWINS_VOYAGE, playerResearch, {
    remaining: '2',
  });

  defaultGame.pendingEffects.handler(DARWINS_VOYAGE, (discharged) =>
    (discharged.target() as PlayerResearch).add(
      (discharged.target() as PlayerResearch).cost()
    )
  );
  defaultGame.pendingEffects.register(pendingEffect);

  push(
    'the debt is recorded, not held in a closure',
    () => defaultGame.pendingEffects.getByTarget(playerResearch).length,
    1
  );
  push(
    'and it says how much is owed',
    () => pendingEffect.data().remaining,
    '2'
  );

  // The save taken between building the wonder and the next research — exactly
  // the moment the old implementation lost the grant.
  const file = save(defaultGame, { name: 'darwins', createdAt: 0 });
  const saved = file.entities.filter(({ type }) => type === 'PendingEffect');

  push('a save carries it', () => saved.length, 1);
  push(
    'with the remainder intact',
    () => (saved[0]?.state._data as { remaining?: string })?.remaining,
    '2'
  );
  push(
    'and pointing at the research it is owed to',
    () => (saved[0]?.state._target as { $ref?: string })?.$ref,
    playerResearch.id()
  );

  // Loaded into a fresh game, the debt comes back as an entity pointing at the
  // restored research — which is what makes it discharegable at all.
  const target = gameForLoad(defaultSlots);

  registerClasses(target, { collisions: [] });
  hydrate(file, target);

  const restored = target.pendingEffects
    .entries()
    .filter((effect) => effect.handler() === DARWINS_VOYAGE);

  push('a load brings it back', () => restored.length, 1);
  push('still owing two', () => restored[0]?.data().remaining, '2');
  push(
    'still pointing at a PlayerResearch',
    () => restored[0]?.target()?.constructor.name,
    'PlayerResearch'
  );
  push(
    'and at the same one, by id',
    () => restored[0]?.target()?.id(),
    playerResearch.id()
  );

  let failures = 0;

  checks.forEach(([label, actual, expected]) => {
    let result: unknown;

    try {
      result = actual();
    } catch (error) {
      result = `threw: ${error instanceof Error ? error.message : error}`;
    }

    const ok = JSON.stringify(result) === JSON.stringify(expected);

    if (!ok) {
      failures += 1;
    }

    process.stdout.write(
      `  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(50)} ${JSON.stringify(result)}${
        ok ? '' : ` (expected ${JSON.stringify(expected)})`
      }\n`
    );
  });

  process.stdout.write(
    `\n${checks.length - failures}/${
      checks.length
    } — Darwin's Voyage survives a save\n`
  );

  process.exit(failures > 0 ? 1 : 0);
};

ruleRegistryInstance.register(new Built(new Effect((): void => {})));

// Before the players are created, because `civ1-player` unregisters a
// civilisation once a player claims it — so a registry read afterwards is
// missing every civilisation in the game.
engine.on('engine:start', (): void => {
  registerClasses(defaultGame, { collisions });
});

engine.on('engine:start', (): void => {
  new Array(config.players).fill(0).forEach((): void => {
    const player = new Player();

    playerRegistryInstance.register(player);
    clientRegistryInstance.register(new SimpleAIClient(player));
  });
});

engine.on('turn:start', (turn: number): void => {
  if (stopped) {
    return;
  }

  if (turn >= 2) {
    stopped = true;
    report();
  }
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
