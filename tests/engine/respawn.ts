// A destroyed civilization comes back (#178). In a seeded game driven through a human `DataTransferClient`, as
//  `gameEnd` does, a computer player is defeated on turn 1: civ1-game-end's respawn rule brings in a new civilization
//  with a Settlers on empty land, the human is told without the new one being named, the defeated player stays out,
//  and there's no conquest while civilizations can come back.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';
import './lib/spawnedClients';

import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import DataTransferClient from '../../src/js/Engine/DataTransferClient';
import Defeated from '@civ-clone/core-player/Rules/Defeated';
import Player from '@civ-clone/core-player/Player';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import { Settlers } from '@civ-clone/civ1-unit/Units';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as gameResultRegistryInstance } from '@civ-clone/core-turn-based-game/GameResultRegistry';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as playerResearchRegistryInstance } from '@civ-clone/core-science/PlayerResearchRegistry';
import { instance as ruleRegistryInstance } from '@civ-clone/core-rule/RuleRegistry';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';

let started = false,
  humanPlayer: Player | null = null,
  helper: SimpleAIClient | null = null,
  handlers: { [channel: string]: (value: any) => unknown } = {},
  sent: { [channel: string]: any[] } = {},
  pendingChoice: ((value: any) => void) | null = null;

const respawned: [Player, Player][] = [];

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `FAIL respawn: ${reason}\n${
      error instanceof Error ? error.stack : String(error ?? '')
    }\n`
  );
  process.exit(1);

  throw new Error(reason);
};

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 50));

engine.on('player:respawned', (player: Player, defeated: Player) =>
  respawned.push([player, defeated])
);

const run = async (): Promise<void> => {
  const [victim] = playerRegistryInstance
      .entries()
      .filter((player) => player !== humanPlayer),
    before = playerRegistryInstance.length;

  ruleRegistryInstance.process(Defeated, victim, null);

  await settle();

  if (respawned.length !== 1 || respawned[0][1] !== victim) {
    fail(`respawned ${JSON.stringify(respawned.length)} times`);
  }

  const [[player]] = respawned;

  if (playerRegistryInstance.includes(victim)) {
    fail('the defeated player is still in the game');
  }

  if (
    !playerRegistryInstance.includes(player) ||
    playerRegistryInstance.length !== before
  ) {
    fail("the new civilization did not take the defeated one's place");
  }

  if (
    player.civilization().sourceClass() === victim.civilization().sourceClass()
  ) {
    fail('the defeated civilization came back as itself');
  }

  const units = unitRegistryInstance.getByPlayer(player);

  if (units.length !== 1 || !(units[0] instanceof Settlers)) {
    fail(`the new civilization has ${units.length} units`);
  }

  // No random starting advances of its own: only ones the human knows can come its way.
  const known = playerResearchRegistryInstance
      .getByPlayer(humanPlayer!)
      .complete()
      .map((advance) => advance.constructor),
    unearned = playerResearchRegistryInstance
      .getByPlayer(player)
      .complete()
      .filter((advance) => !known.includes(advance.constructor));

  if (unearned.length > 0) {
    fail(
      `the new civilization knows ${unearned
        .map((advance) => advance.constructor.name)
        .join(', ')}, which the human doesn't`
    );
  }

  if (clientRegistryInstance.getBy('player', player).length !== 1) {
    fail('the new civilization has no client');
  }

  // Each notification is sent as a transfer object: the notification itself is the one its hierarchy refers to.
  const notices = (sent.gameNotification ?? []).map(
      ({ hierarchy, objects }: any) => objects[hierarchy['#ref']]
    ),
    notice = notices.find(({ key }: any) =>
      String(key).startsWith('Player.respawned')
    );

  if (
    !notice ||
    notice.key !== 'Player.respawned.unmet' ||
    Object.keys(notice.data).length !== 0
  ) {
    fail(`the human was told ${JSON.stringify(notices)}`);
  }

  if (gameResultRegistryInstance.get() !== null) {
    fail('the game ended');
  }

  console.log(
    `PASS respawn (${victim.civilization().constructor.name} came back as ${
      player.civilization().constructor.name
    }, with a Settlers, and the human was told without naming it)`
  );

  process.exit(0);
};

const transport = {
  receive: (channel: string, handler: (...args: any[]) => unknown) => {
    handlers[channel] = handler;

    return () => false;
  },
  receiveOnce: (channel: string, handler: (value: any) => void) => {
    if (channel === 'chooseFromList') {
      pendingChoice = handler;
    }

    return () => {
      pendingChoice = null;
    };
  },
  send: (channel: string, data: any): void => {
    if (channel === 'chooseFromList') {
      const meta = data as ChoiceMeta<any>,
        respond = pendingChoice;

      // `receiveOnce` is registered after the send, so answer on the next tick.
      setTimeout(() =>
        helper!
          .chooseFromList(meta)
          .then((value) => {
            const [choice] = meta
              .choices()
              .filter((choice) => choice.value() === value);

            (pendingChoice ?? respond)!(choice?.id());
          })
          .catch((error) => fail('the helper could not choose', error))
      );

      return;
    }

    if (['gameOver', 'gameNotification'].includes(channel)) {
      (sent[channel] ??= []).push(JSON.parse(JSON.stringify(data)));

      return;
    }

    if (channel === 'turnStarted' && !started) {
      started = true;

      setTimeout(() =>
        run().catch((error) => fail('the test could not be played', error))
      );
    }
  },
};

engine.on('engine:start', (): void => {
  new Array(config.players).fill(0).forEach((_, index): void => {
    const player = new Player();

    playerRegistryInstance.register(player);

    if (index === 0) {
      humanPlayer = player;
      helper = new SimpleAIClient(player);

      clientRegistryInstance.register(
        new DataTransferClient(
          player,
          transport as any,
          (channel, payload) => transport.send(channel, payload),
          () => {}
        )
      );

      return;
    }

    clientRegistryInstance.register(new SimpleAIClient(player));
  });
});

engine.setOption('players', config.players);
engine.setOption('height', config.height);
engine.setOption('width', config.width);

process.on('uncaughtException', (error) => fail('uncaught exception', error));
process.on('unhandledRejection', (error) => fail('unhandled rejection', error));

engine.start();

import('../../src/js/plugins')
  .then(() => engine.emit('plugins:load:end'))
  .catch((error) => fail('failed to load plugins', error));
