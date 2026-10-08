// A unit move reaches the UI in one patch, not two (#321).
//
// A move touches the tiles either side of it and, once `handleAction` returns, the player. The UI rebuilds its game
// data for every `gameDataPatch` it gets, so the two used to cost two rebuilds. The client now holds its flushes while
// it handles one of the human's actions and sends what queued up in one message.
//
// Drives a seeded game with a human `DataTransferClient` over a stub transport that records every `gameDataPatch`.
// When the turn is handed over, the test sends the same `Move` action the UI sends and expects one patch carrying the
// from tile, the to tile and the player. A `SimpleAIClient` for the same player then plays the rest of the turn, so
// that `EndTurn` is allowed, and ending it takes one patch followed by `turnEnded`.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';

import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import DataTransferClient from '../../src/js/Engine/DataTransferClient';
import { Move } from '@civ-clone/civ1-unit/Actions';
import Player from '@civ-clone/core-player/Player';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import Tile from '@civ-clone/core-world/Tile';
import Unit from '@civ-clone/core-unit/Unit';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';

type Message = { channel: string; data: any };

let started = false,
  humanPlayer: Player | null = null,
  helper: SimpleAIClient | null = null,
  actionHandler: ((action: any) => void) | null = null,
  pendingChoice: ((value: any) => void) | null = null,
  // Everything the transport was sent since the last `reset`.
  messages: Message[] = [];

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `FAIL oneFlushPerAction: ${reason}\n${
      error instanceof Error ? error.stack : String(error ?? '')
    }\n`
  );
  process.exit(1);

  throw new Error(reason);
};

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const reset = (): void => {
  messages = [];
};

const patches = (): any[][] =>
  messages
    .filter(({ channel }) => channel === 'gameDataPatch')
    .map(({ data }) => data);

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
      // Patches are serialised when they are sent, so take a copy as the UI would receive it.
      messages.push({ channel, data: JSON.parse(JSON.stringify(data)) });

      return;
    }

    if (channel === 'turnStarted' || channel === 'turnEnded') {
      messages.push({ channel, data });

      if (channel === 'turnStarted' && !started) {
        started = true;

        setTimeout(() => run().catch((error) => fail('the test threw', error)));
      }
    }
  },
};

const idsIn = (patch: any[]): Set<string> =>
  new Set(patch.flatMap((update) => Object.keys(update)));

// The units a patch sends with their actions (#323).
const unitsWithActionsIn = (patch: any[]): string[] => [
  ...new Set(
    patch.flatMap((update) =>
      Object.values(update).flatMap(({ value }: any) =>
        Object.entries(value?.objects ?? {})
          .filter(
            ([, object]: [string, any]) =>
              object?.__?.includes('Unit') && 'actionsForNeighbours' in object
          )
          .map(([id]) => id)
      )
    )
  ),
];

// A unit of the human's that can step onto a neighbouring tile the player has seen.
const findMove = (): { unit: Unit; from: Tile; to: Tile; target: string } => {
  const playerWorld = playerWorldRegistryInstance.getByPlayer(humanPlayer!);

  for (const unit of unitRegistryInstance.getByPlayer(humanPlayer!)) {
    if (unit.moves().value() <= 0 || unit.busy()) {
      continue;
    }

    for (const to of unit.tile().getNeighbours()) {
      const playerTile = playerWorld.getByTile(to);

      if (
        playerTile &&
        unit.actions(to).some((action) => action instanceof Move)
      ) {
        return {
          unit,
          from: unit.tile(),
          to,
          target: playerTile.id(),
        };
      }
    }
  }

  return fail('the human has no unit that can move to a neighbouring tile');
};

const run = async (): Promise<void> => {
  const { unit, from, to, target } = findMove(),
    playerWorld = playerWorldRegistryInstance.getByPlayer(humanPlayer!),
    fromId = playerWorld.getByTile(from)!.id(),
    toId = target;

  // Moves to spare, so it can still act after the move and its actions should go with it (#323).
  unit.moves().set(unit.moves().value() + 2);

  await wait(20);
  reset();

  actionHandler!({
    name: 'ActiveUnit',
    id: unit.id(),
    unitAction: 'Move',
    target,
  });

  // `handleAction` is asynchronous and the emitter does not hand its promise back, so give it, and any second message
  //  it might send, time to land.
  await wait(200);

  if (unit.tile() !== to) {
    fail(`unit ${unit.id()} did not move`);
  }

  const moved = patches();

  if (moved.length !== 1) {
    fail(`a move sent ${moved.length} gameDataPatch messages, not 1`);
  }

  const ids = idsIn(moved[0]);

  [
    ['the from tile', fromId],
    ['the to tile', toId],
    ['the player', humanPlayer!.id()],
  ].forEach(([what, id]) => {
    if (!ids.has(id)) {
      fail(`the move's patch does not carry ${what} (${id})`);
    }
  });

  // Only the unit that moved, which still has moves left, is sent with its actions (#323).
  const withActions = unitsWithActionsIn(moved[0]);

  if (withActions.join() !== unit.id()) {
    fail(
      `the move's patch carried actions for [${withActions.join(
        ', '
      )}], not just ${unit.id()}`
    );
  }

  // Play the rest of the turn so `EndTurn` is accepted; what that sends does not matter here.
  await helper!.takeTurn();
  await wait(50);

  reset();

  actionHandler!({ name: 'EndTurn' });

  await wait(200);

  // The next turn may already be under way by now; only what comes up to `turnEnded` is the ending of this one.
  const channels = messages.map(({ channel }) => channel),
    ended = channels.indexOf('turnEnded') + 1;

  if (
    ended === 0 ||
    channels.slice(0, ended).join() !== 'gameDataPatch,turnEnded'
  ) {
    fail(
      `ending the turn sent [${channels
        .slice(0, ended || undefined)
        .join(', ')}], not one gameDataPatch then turnEnded`
    );
  }

  console.log(
    `PASS oneFlushPerAction (a move sent 1 patch carrying ${ids.size} updates and the moved unit's actions alone, ending the turn sent 1 patch then turnEnded)`
  );

  process.exit(0);
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
