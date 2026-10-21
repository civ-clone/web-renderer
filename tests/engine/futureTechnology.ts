// Future Technology (#128): once a player knows every advance, research carries on into Future Technology 1, 2, …,
//  each costing more than the last and named with its number when it's discovered. It can't be stolen by a Diplomat,
//  and a hut never gives one.
//
// Drives a seeded game with a human `DataTransferClient`, as `improvementObsolete` does. On the human's first turn the
// test grants the human every other advance, then researches Future Technology twice.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';
import './lib/spawnedClients';

import Advance from '@civ-clone/core-science/Advance';
import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import DataTransferClient from '../../src/js/Engine/DataTransferClient';
import { FutureTechnology } from '@civ-clone/civ1-science/Advances';
import GoodyHut from '@civ-clone/core-goody-hut/GoodyHut';
import GoodyHutAdvance from '@civ-clone/base-goody-hut-advance/Advance';
import Player from '@civ-clone/core-player/Player';
import Research from '@civ-clone/core-science/Yields/Research';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import { instance as advanceRegistryInstance } from '@civ-clone/core-science/AdvanceRegistry';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerResearchRegistryInstance } from '@civ-clone/core-science/PlayerResearchRegistry';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { stealableAdvances } from '@civ-clone/civ1-unit/Rules/Unit/diplomat';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';

let started = false,
  humanPlayer: Player | null = null,
  humanClient: DataTransferClient | null = null,
  helper: SimpleAIClient | null = null,
  actionHandler: ((action: any) => unknown) | null = null,
  pendingChoice: ((value: any) => void) | null = null,
  // Every notification sent since it was last cleared.
  notificationsSent: any[] = [];

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `FAIL futureTechnology: ${reason}\n${
      error instanceof Error ? error.stack : String(error ?? '')
    }\n`
  );
  process.exit(1);

  throw new Error(reason);
};

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 50));

const discoveries = (): any[] =>
  notificationsSent.filter(
    (notification) => notification.key === 'Player.research-complete'
  );

const futureTechnologies = (player: Player): number =>
  playerResearchRegistryInstance
    .getByPlayer(player)
    .complete()
    .filter((advance) => advance instanceof FutureTechnology).length;

const run = async (): Promise<void> => {
  const research = playerResearchRegistryInstance.getByPlayer(humanPlayer!),
    names = (advances: (typeof Advance)[]): string[] =>
      advances.map((AdvanceType) => AdvanceType.name);

  if (research.available().includes(FutureTechnology)) {
    fail('Future Technology was available from the start');
  }

  advanceRegistryInstance
    .filter((AdvanceType: typeof Advance) => !AdvanceType.repeatable)
    .forEach((AdvanceType) => research.addAdvance(AdvanceType));
  await settle();

  if (JSON.stringify(names(research.available())) !== '["FutureTechnology"]') {
    fail(
      `expected only Future Technology to be available, got ${JSON.stringify(
        names(research.available())
      )}`
    );
  }

  notificationsSent = [];

  const costs: number[] = [];

  for (let i = 0; i < 2; i++) {
    research.research(FutureTechnology);
    costs.push(research.cost().value());
    research.add(new Research(research.cost().value()));
    await settle();
  }

  if (
    futureTechnologies(humanPlayer!) !== 2 ||
    research.researching() !== null
  ) {
    fail(
      `expected two Future Technologies and nothing being researched, got ${futureTechnologies(
        humanPlayer!
      )} and ${research.researching()?.name}`
    );
  }

  if (!(costs[1] > costs[0])) {
    fail(`the second Future Technology didn't cost more: ${costs}`);
  }

  if (
    JSON.stringify(
      discoveries().map((notification) => [
        notification.data.advance?._,
        notification.data.number,
      ])
    ) !== '[["FutureTechnology",1],["FutureTechnology",2]]'
  ) {
    fail(
      `expected the discoveries of Future Technology 1 and 2, got ${JSON.stringify(
        discoveries().map((notification) => notification.data)
      )}`
    );
  }

  if (JSON.stringify(names(research.available())) !== '["FutureTechnology"]') {
    fail('Future Technology was not offered again');
  }

  const [rival] = playerRegistryInstance
    .entries()
    .filter((player) => player !== humanPlayer);

  if (
    names(stealableAdvances(rival, humanPlayer!)).includes('FutureTechnology')
  ) {
    fail('a Diplomat could steal a Future Technology');
  }

  if (stealableAdvances(rival, humanPlayer!).length === 0) {
    fail('a Diplomat had nothing to steal, so the check proves nothing');
  }

  const [unit] = unitRegistryInstance.getByPlayer(humanPlayer!);

  if (
    new GoodyHut(unit.tile())
      .actions(unit)
      .some((action) => action instanceof GoodyHutAdvance)
  ) {
    fail('a hut could give an advance with only Future Technology left');
  }

  console.log(
    'PASS futureTechnology (offered once every advance is known, twice over at a rising cost, numbered in the news; never stolen, never in a hut)'
  );

  process.exit(0);
};

const transport = {
  receive: (channel: string, handler: (...args: any[]) => unknown) => {
    if (channel === 'action') {
      actionHandler = handler;
    }

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

    if (channel === 'gameNotification') {
      // Sent as `{ hierarchy, objects }`: resolve the notification and the refs in its data.
      const { hierarchy, objects } = JSON.parse(JSON.stringify(data)),
        resolve = (value: any): any =>
          value && typeof value === 'object' && '#ref' in value
            ? objects[value['#ref']]
            : value,
        notification = resolve(hierarchy);

      notificationsSent.push({
        ...notification,
        data: Object.fromEntries(
          Object.entries(notification.data ?? {}).map(([key, value]) => [
            key,
            resolve(value),
          ])
        ),
      });

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

      humanClient = new DataTransferClient(player, transport as any);

      clientRegistryInstance.register(humanClient);

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
