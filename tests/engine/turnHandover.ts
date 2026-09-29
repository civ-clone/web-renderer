// The UI is told when its turn ends and when the next one is ready, and the new turn reaches it before the messages
//  about it (#61, #130).
//
// Drives a seeded game with a human `DataTransferClient` that is not automated, so its turns take the path the real
// UI does: `takeTurn` sends the turn, hands over with `turnStarted` and waits for actions. The test plays each turn
// with a `SimpleAIClient` for the same player, then sends `EndTurn` the way the UI would.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';

import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import DataTransferClient from '../../src/js/Engine/DataTransferClient';
import Player from '@civ-clone/core-player/Player';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as currentPlayerRegistryInstance } from '@civ-clone/core-player/CurrentPlayerRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as turnInstance } from '@civ-clone/core-turn-based-game/Turn';

const TURNS = Number(process.env.TURN_HANDOVER_TURNS ?? 40);

let stopped = false,
  handedOver = false,
  handovers = 0,
  heldNotifications = 0,
  humanPlayer: Player | null = null,
  humanClient: DataTransferClient | null = null,
  helper: SimpleAIClient | null = null,
  actionHandler: ((action: any) => void) | null = null,
  // The Turn carried by the latest patch, if it carried one.
  lastPatchTurn: number | null = null;

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `FAIL turnHandover: ${reason}\n${
      error instanceof Error ? error.stack : String(error ?? '')
    }\n`
  );
  process.exit(1);

  throw new Error(reason);
};

// On the next tick, as the UI would: the notifications held for the handover go out straight after `turnStarted`.
const playTurn = (): void => {
  setTimeout(() =>
    helper!
      .takeTurn()
      .then(() => actionHandler!({ name: 'EndTurn' }))
      .catch((error) => fail('the helper could not play the turn', error))
  );
};

const transport = {
  receive: (channel: string, handler: (...args: any[]) => void) => {
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
    if (stopped) {
      return;
    }

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

    if (channel === 'gameDataPatch') {
      const turnId = turnInstance.id(),
        turnPatch = (data as any[]).find((patch) => turnId in patch);

      if (!turnPatch) {
        lastPatchTurn = null;

        return;
      }

      const { hierarchy, objects } = JSON.parse(
        JSON.stringify(turnPatch[turnId].value)
      );

      lastPatchTurn = (objects[hierarchy['#ref']] ?? hierarchy).value;

      return;
    }

    if (channel === 'gameNotification') {
      const [currentPlayer] = currentPlayerRegistryInstance.entries();

      if (currentPlayer === humanPlayer && !handedOver) {
        fail(
          `a notification reached the UI during the human's turn start, before the turn did (turn ${turnInstance.value()})`
        );
      }

      if (currentPlayer === humanPlayer && handedOver && lastPatchTurn === -1) {
        heldNotifications++;
      }

      return;
    }

    if (channel === 'turnStarted') {
      if (handedOver) {
        fail(
          `turnStarted twice without a turnEnded (turn ${turnInstance.value()})`
        );
      }

      if (lastPatchTurn !== turnInstance.value()) {
        fail(
          `turnStarted followed a patch with turn ${lastPatchTurn}, not ${turnInstance.value()}`
        );
      }

      handedOver = true;
      handovers++;

      // Anything sent from here to the next patch was held until now.
      lastPatchTurn = -1;

      playTurn();

      return;
    }

    if (channel === 'turnEnded') {
      if (!handedOver) {
        fail(`turnEnded without a turnStarted (turn ${turnInstance.value()})`);
      }

      handedOver = false;
    }
  },
};

let pendingChoice: ((value: any) => void) | null = null;

const LOOP_EVENTS = [
  'player:turn-end',
  'player:turn-start',
  'turn:end',
  'turn:start',
];
const emit = engine.emit.bind(engine);

engine.emit = (event: string, ...args: any[]): void => {
  if (stopped && LOOP_EVENTS.includes(event)) {
    return;
  }

  emit(event, ...args);
};

engine.on('turn:start', (turn: number): void => {
  if (stopped || turn < TURNS) {
    return;
  }

  stopped = true;

  if (handovers < TURNS - 1) {
    fail(`only ${handovers} handovers in ${turn} turns`);
  }

  if (heldNotifications === 0) {
    fail(
      `no notification was held for the handover in ${turn} turns, so the ordering was never tested`
    );
  }

  console.log(
    `PASS turnHandover (${handovers} handovers and ${heldNotifications} held notifications over ${turn} turns)`
  );

  process.exit(0);
});

engine.on('engine:start', (): void => {
  new Array(config.players).fill(0).forEach((_, index): void => {
    const player = new Player();

    playerRegistryInstance.register(player);

    if (index === 0) {
      humanPlayer = player;
      helper = new SimpleAIClient(player);
      humanClient = new DataTransferClient(
        player,
        transport as any,
        (channel, payload) => transport.send(channel, payload),
        () => {}
      );

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
