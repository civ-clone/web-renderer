// The Civilization Score (#149) is added up in the worker by the engine's `Score` rules and sent to the UI term by term.
//  In a seeded game driven through a human `DataTransferClient`, as `topCities` does, this founds a city and asks for
//  the score through the transport: every civ1-score term is there in the score screen's order, the total is their sum,
//  the new city's citizens count, and counting them at 40% luxuries leaves the player's own rates as they were.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';
import './lib/spawnedClients';

import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import DataTransferClient from '../../src/js/Engine/DataTransferClient';
import Player from '@civ-clone/core-player/Player';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import { Settlers } from '@civ-clone/civ1-unit/Units';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as playerTradeRatesRegistryInstance } from '@civ-clone/core-trade-rate/PlayerTradeRatesRegistry';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';

let started = false,
  humanPlayer: Player | null = null,
  helper: SimpleAIClient | null = null,
  actionHandler: ((action: any) => unknown) | null = null,
  scoreHandler: ((value: null) => unknown) | null = null,
  scoreSent: any = null,
  pendingChoice: ((value: any) => void) | null = null;

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `FAIL civilizationScore: ${reason}\n${
      error instanceof Error ? error.stack : String(error ?? '')
    }\n`
  );
  process.exit(1);

  throw new Error(reason);
};

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 50));

const rates = (): string =>
  playerTradeRatesRegistryInstance
    .getByPlayer(humanPlayer!)
    .all()
    .map((rate) => `${rate.constructor.name}:${rate.value()}`)
    .join(',');

const run = async (): Promise<void> => {
  const [founder] = unitRegistryInstance
    .getByPlayer(humanPlayer!)
    .filter((unit) => unit instanceof Settlers);

  if (!founder) {
    fail('the human player has no Settlers to start with');
  }

  await Promise.resolve(
    actionHandler!({
      name: 'ActiveUnit',
      id: founder.id(),
      unitAction: 'FoundCity',
      target: playerWorldRegistryInstance
        .getByPlayer(humanPlayer!)
        .getByTile(founder.tile())!
        .id(),
    })
  ).then(settle);

  if (cityRegistryInstance.getByPlayer(humanPlayer!).length === 0) {
    fail('the starting Settlers could not found a city');
  }

  const before = rates();

  // Asked through the transport, as the report does.
  scoreHandler!(null);

  const sent = scoreSent;

  if (rates() !== before) {
    fail(`counting the citizens changed the rates from ${before} to ${rates()}`);
  }

  const terms = (sent?.terms ?? []).map(({ term }: any) => term).join(',');

  if (
    terms !== 'citizens,wonders,spaceship,pollution,peace,future-technology'
  ) {
    fail(`the score's terms were ${JSON.stringify(sent)}`);
  }

  const sum = sent.terms.reduce(
    (total: number, { value }: any) => total + value,
    0
  );

  if (sent.total !== Math.max(0, sum)) {
    fail(`the total ${sent.total} isn't the terms' sum ${sum}`);
  }

  const citizens = sent.terms.find(({ term }: any) => term === 'citizens');

  if (!(citizens.value >= 1)) {
    fail(`a size 1 city's citizens counted ${citizens.value}`);
  }

  console.log(
    `PASS civilizationScore (every term, the total, and the rates left alone: ${JSON.stringify(
      sent
    )})`
  );

  process.exit(0);
};

const transport = {
  receive: (channel: string, handler: (...args: any[]) => unknown) => {
    if (channel === 'action') {
      actionHandler = handler;
    }

    if (channel === 'civilizationScore') {
      scoreHandler = handler;
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

    if (channel === 'civilizationScore') {
      scoreSent = JSON.parse(JSON.stringify(data));

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
