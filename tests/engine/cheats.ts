// #65: the Grant Advance and Grant Gold cheats can target any player, not
// just the local one.
//
// Drives a seeded game with one automated `DataTransferClient` and the rest
// as `SimpleAIClient`s, the same setup `patchRefs.ts` uses. A fake transport
// records what is sent and lets the test invoke the `'cheat'` and
// `'cheatPlayers'` receivers directly, the way the page would via
// `transport.send`/`transport.request`.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';

import DataTransferClient from '../../src/js/Engine/DataTransferClient';
import { DataPatch } from '../../src/js/Engine/DataQueue';
import Player from '@civ-clone/core-player/Player';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import Writing from '@civ-clone/base-science-advance-writing/Writing';
import { Gold } from '@civ-clone/civ1-city/Yields';
import { instance as advanceRegistryInstance } from '@civ-clone/core-science/AdvanceRegistry';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as playerResearchRegistryInstance } from '@civ-clone/core-science/PlayerResearchRegistry';
import { instance as playerTreasuryRegistryInstance } from '@civ-clone/core-treasury/PlayerTreasuryRegistry';

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `${reason}\n${error instanceof Error ? error.stack : String(error ?? '')}\n`
  );
  process.exit(1);

  throw new Error(reason);
};

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    fail(`FAIL cheats: ${message}`);
  }
};

let stopped = false;

// Stands in for the worker/page transport: records what the worker sends and
// lets the test call the registered receivers directly, as `AbstractTransport`
// does for a real `send`/`receive` pair.
const receivers = new Map<string, (data: any) => void>(),
  sent: Record<string, any[]> = {};

const transport = {
  receive: (channel: string, handler: (data: any) => void) => {
    receivers.set(channel, handler);

    return () => receivers.delete(channel);
  },
  receiveOnce: (channel: string, handler: (data: any) => void) => {
    receivers.set(channel, handler);

    return () => receivers.delete(channel);
  },
  send: (channel: string, data: any): void => {
    (sent[channel] ??= []).push(data);
  },
};

const trigger = (channel: string, data: any): void => {
  const handler = receivers.get(channel);

  if (!handler) {
    fail(`no '${channel}' receiver registered`);

    return;
  }

  handler(data);
};

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
  // Civilizations are only assigned once `world:built` resolves, so wait for
  // the first turn rather than asserting straight off `engine:start`.
  if (stopped || turn < 1) {
    return;
  }

  stopped = true;

  const [localPlayer, rival] = playerRegistryInstance.entries();

  if (!rival) {
    fail(
      `needs at least 2 players to target a rival, got ${
        playerRegistryInstance.entries().length
      }`
    );
  }

  // 1. `cheatPlayers` lists every registered player, exactly one of them
  //    marked as local, with ids matching `player.id()`.
  trigger('cheatPlayers', null);

  const [cheatPlayers] = sent.cheatPlayers ?? [];

  assert(!!cheatPlayers, 'cheatPlayers sent nothing');
  assert(
    cheatPlayers.length === playerRegistryInstance.entries().length,
    `cheatPlayers returned ${cheatPlayers.length} entries, expected ${
      playerRegistryInstance.entries().length
    }`
  );
  assert(
    cheatPlayers.filter((entry: any) => entry.isLocal).length === 1,
    'cheatPlayers should mark exactly one entry as isLocal'
  );
  playerRegistryInstance.entries().forEach((player) => {
    assert(
      cheatPlayers.some((entry: any) => entry.id === player.id()),
      `cheatPlayers is missing player ${player.id()}`
    );
  });

  const [localEntry] = cheatPlayers.filter((entry: any) => entry.isLocal);

  assert(
    localEntry?.id === localPlayer.id(),
    'the isLocal entry should be the local player'
  );

  const localTreasury = playerTreasuryRegistryInstance.getByPlayerAndType(
      localPlayer,
      Gold
    ),
    rivalTreasury = playerTreasuryRegistryInstance.getByPlayerAndType(
      rival,
      Gold
    );

  // 2. GrantGold with no `player` adds to the local player's treasury.
  const localBefore = localTreasury.value();

  trigger('cheat', { name: 'GrantGold', value: { amount: 100 } });

  assert(
    localTreasury.value() === localBefore + 100,
    `local treasury should be ${
      localBefore + 100
    }, got ${localTreasury.value()}`
  );

  // 3. GrantGold with a rival's id adds to the rival's treasury, leaves the
  //    local one unchanged, and sends no patch keyed by the rival's
  //    treasury (#46 — rivals' treasuries never go to the page).
  const localAfterOwnGrant = localTreasury.value(),
    rivalBefore = rivalTreasury.value(),
    patchBatchesBefore = (sent.gameDataPatch ?? []).length;

  trigger('cheat', {
    name: 'GrantGold',
    value: { amount: 50, player: rival.id() },
  });

  assert(
    rivalTreasury.value() === rivalBefore + 50,
    `rival treasury should be ${rivalBefore + 50}, got ${rivalTreasury.value()}`
  );
  assert(
    localTreasury.value() === localAfterOwnGrant,
    'granting gold to a rival should not change the local treasury'
  );

  const newPatches: DataPatch[] = (sent.gameDataPatch ?? [])
    .slice(patchBatchesBefore)
    .flat();

  assert(
    !newPatches.some((patch) => rivalTreasury.id() in patch),
    "granting gold to a rival should not patch the rival's treasury"
  );

  // 4. GrantAdvance with a rival's id and an advance they lack completes it
  //    for them.
  const rivalResearch = playerResearchRegistryInstance.getByPlayer(rival);

  assert(
    !rivalResearch.completed(Writing),
    'rival should not already know Writing (test assumption broke)'
  );

  trigger('cheat', {
    name: 'GrantAdvance',
    value: { advances: ['Writing'], player: rival.id() },
  });

  assert(
    rivalResearch.completed(Writing),
    "GrantAdvance with a rival's id should complete the advance for them"
  );

  // 6. `cheatAdvances` lists every advance a player hasn't discovered, not
  //    just what they could research next, and GrantAdvance grants several
  //    at once, prerequisites or not.
  const advancesBatchesBefore = (sent.cheatAdvances ?? []).length;

  trigger('cheatAdvances', rival.id());

  const [rivalAvailable] = (sent.cheatAdvances ?? []).slice(
      advancesBatchesBefore
    ),
    expectedAvailable = advanceRegistryInstance
      .entries()
      .filter((Advance) => !rivalResearch.completed(Advance))
      .map((Advance) => Advance.name);

  assert(
    JSON.stringify(rivalAvailable) === JSON.stringify(expectedAvailable),
    `cheatAdvances for the rival should be ${JSON.stringify(
      expectedAvailable
    )}, got ${JSON.stringify(rivalAvailable)}`
  );
  assert(
    rivalAvailable.length >= 2,
    `needs at least 2 available advances to grant several, got ${rivalAvailable.length}`
  );

  assert(
    rivalAvailable.includes('Automobile'),
    'cheatAdvances should list Automobile on the first turn'
  );

  const [first] = rivalAvailable as string[],
    second = 'Automobile';

  trigger('cheat', {
    name: 'GrantAdvance',
    value: { advances: [first, second], player: rival.id() },
  });

  assert(
    rivalResearch
      .complete()
      .filter((advance) => [first, second].includes(advance.sourceClass().name))
      .length === 2,
    `GrantAdvance should complete both ${first} and ${second} for the rival`
  );

  trigger('cheatAdvances', null);

  const localAvailable = (sent.cheatAdvances ?? []).pop(),
    localResearch = playerResearchRegistryInstance.getByPlayer(localPlayer),
    localExpected = advanceRegistryInstance
      .entries()
      .filter((Advance) => !localResearch.completed(Advance))
      .map((Advance) => Advance.name);

  assert(
    JSON.stringify(localAvailable) === JSON.stringify(localExpected),
    "cheatAdvances with no player should list the local player's advances"
  );

  // 5. An unknown `player` id changes nothing.
  const localGoldBefore = localTreasury.value(),
    rivalGoldBefore = rivalTreasury.value(),
    patchBatchesBeforeUnknown = (sent.gameDataPatch ?? []).length;

  trigger('cheat', {
    name: 'GrantGold',
    value: { amount: 999, player: 'no-such-player' },
  });

  assert(
    localTreasury.value() === localGoldBefore &&
      rivalTreasury.value() === rivalGoldBefore,
    'an unknown player id should change nothing'
  );
  assert(
    (sent.gameDataPatch ?? []).length === patchBatchesBeforeUnknown,
    'an unknown player id should send no patch'
  );

  console.log(
    'PASS cheats (cheatPlayers and cheatAdvances listings, GrantGold and GrantAdvance target rivals correctly)'
  );
  process.exit(0);
});

engine.on('engine:start', (): void => {
  new Array(config.players).fill(0).forEach((_, index): void => {
    const player = new Player();

    playerRegistryInstance.register(player);
    clientRegistryInstance.register(
      index === 0
        ? new DataTransferClient(
            player,
            transport as any,
            (channel, payload) => transport.send(channel, payload),
            () => {},
            { automationEnabled: true }
          )
        : new SimpleAIClient(player)
    );
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
