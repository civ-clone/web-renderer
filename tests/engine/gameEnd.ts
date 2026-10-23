// The game can end (#176). In a seeded game driven through a human `DataTransferClient`, as `civilizationScore` does,
//  this plays one of two endings, chosen by `GAME_END`:
//
//  - `retired`: Game → Retire sends the ending with your score and rating, the turn loop's result is pending until
//    Keep playing, and afterwards the score is final ("scoring completed"), a second Retire shows the same ending,
//    and being destroyed after that still sends the archeologists' ending. A game loaded while the ending waits for
//    Keep playing shows it again, and one loaded after does not (#503).
//  - `destroyed`: losing every unit before founding a city destroys your civilization, which sends the archeologists'
//    ending with no score and no Keep playing.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';
import './lib/spawnedClients';

import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import DataTransferClient from '../../src/js/Engine/DataTransferClient';
import Player from '@civ-clone/core-player/Player';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as gameResultRegistryInstance } from '@civ-clone/core-turn-based-game/GameResultRegistry';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';

const mode = process.env.GAME_END ?? 'retired';

let started = false,
  humanPlayer: Player | null = null,
  helper: SimpleAIClient | null = null,
  handlers: { [channel: string]: (value: any) => unknown } = {},
  sent: { [channel: string]: any[] } = {},
  pendingChoice: ((value: any) => void) | null = null;

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `FAIL gameEnd (${mode}): ${reason}\n${
      error instanceof Error ? error.stack : String(error ?? '')
    }\n`
  );
  process.exit(1);

  throw new Error(reason);
};

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 50));

const retired = async (): Promise<void> => {
  handlers.retire(null);

  const [ending] = sent.gameOver ?? [];

  if (!ending) {
    fail('Retire sent no ending');
  }

  if (
    ending.reason !== 'retired' ||
    ending.winner !== null ||
    ending.score === null ||
    typeof ending.rating !== 'number' ||
    ending.keepPlaying !== true ||
    ending.scoringComplete !== false ||
    ending.discovery !== null
  ) {
    fail(`the ending was ${JSON.stringify(ending)}`);
  }

  if (
    ending.score.total !==
    ending.score.terms.reduce((t: number, { value }: any) => t + value, 0)
  ) {
    fail(
      `the ending's score ${JSON.stringify(ending.score)} isn't its terms' sum`
    );
  }

  if (!gameResultRegistryInstance.pending()) {
    fail('the game ended, but nothing is waiting for Keep playing');
  }

  // A game saved now ends again as it loads: `loadGame` says it has loaded once the client is made.
  engine.emit('game:loaded');

  const resent = (sent.gameOver ?? []).splice(1);

  if (
    resent.length !== 1 ||
    JSON.stringify(resent[0]) !== JSON.stringify(ending)
  ) {
    fail(
      `a game loaded before Keep playing sent ${JSON.stringify(
        resent
      )}, not the same ending again, once`
    );
  }

  handlers.gameContinue(null);

  if (gameResultRegistryInstance.pending()) {
    fail('Keep playing left the game waiting');
  }

  // Once kept playing, a game saved and loaded goes on.
  engine.emit('game:loaded');

  if ((sent.gameOver ?? []).length !== 1) {
    fail(
      `a game loaded after Keep playing sent the ending again: ${JSON.stringify(
        sent.gameOver
      )}`
    );
  }

  handlers.civilizationScore(null);

  const [score] = sent.civilizationScore ?? [];

  if (score?.scoringComplete !== true) {
    fail(`after Keep playing the score was ${JSON.stringify(score)}`);
  }

  // Retiring again shows the same ending, with its score now final.
  handlers.retire(null);

  const again = (sent.gameOver ?? [])[1];

  if (
    (sent.gameOver ?? []).length !== 2 ||
    again.reason !== 'retired' ||
    again.scoringComplete !== true ||
    gameResultRegistryInstance.get()!.reason() !== 'retired'
  ) {
    fail(`a second Retire sent ${JSON.stringify(sent.gameOver)}`);
  }

  // Destroyed after keeping playing: the game can't end again, but you are still told.
  unitRegistryInstance
    .getByPlayer(humanPlayer!)
    .forEach((unit) => unit.destroy(null));

  await settle();

  const destroyedAfter = (sent.gameOver ?? [])[2];

  if (
    destroyedAfter?.reason !== 'destroyed' ||
    destroyedAfter.keepPlaying !== false ||
    destroyedAfter.score !== null
  ) {
    fail(
      `destroyed after keeping playing sent ${JSON.stringify(destroyedAfter)}`
    );
  }

  console.log(
    `PASS gameEnd retired (the ending, again as the game loads, Keep playing, then a final score, and destroyed afterwards: ${JSON.stringify(
      ending
    )})`
  );
};

const destroyed = async (): Promise<void> => {
  unitRegistryInstance
    .getByPlayer(humanPlayer!)
    .forEach((unit) => unit.destroy(null));

  await settle();

  const [ending] = sent.gameOver ?? [];

  if (!ending) {
    fail('losing every unit sent no ending');
  }

  if (
    ending.reason !== 'destroyed' ||
    ending.score !== null ||
    ending.rating !== null ||
    ending.keepPlaying !== false
  ) {
    fail(`the ending was ${JSON.stringify(ending)}`);
  }

  if (playerRegistryInstance.includes(humanPlayer!)) {
    fail('the human was not defeated');
  }

  console.log(
    `PASS gameEnd destroyed (the archeologists' ending, with no score: ${JSON.stringify(
      ending
    )})`
  );
};

const run = async (): Promise<void> => {
  await (mode === 'destroyed' ? destroyed() : retired());

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

    if (['gameOver', 'civilizationScore'].includes(channel)) {
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
        new DataTransferClient(player, transport as any)
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
