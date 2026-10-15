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
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';
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

  // 7. `cheatUnitTypes` lists unit classes by name, and `CreateUnit` builds
  //    one for the human and for a rival at the chosen tile.
  trigger('cheatUnitTypes', null);

  const [unitTypes] = sent.cheatUnitTypes ?? [];

  assert(
    Array.isArray(unitTypes) &&
      ['Warrior', 'Settlers', 'Nuclear'].every((name) =>
        unitTypes.includes(name)
      ),
    `cheatUnitTypes should list Warrior, Settlers and Nuclear, got ${JSON.stringify(
      unitTypes
    )}`
  );
  assert(
    !unitTypes.includes('Barracks'),
    'cheatUnitTypes should only list units'
  );

  const world = playerWorldRegistryInstance
      .getByPlayer(localPlayer)
      .entries()[0]
      .tile()
      .map(),
    unitAt = (player: Player, x: number, y: number, name: string) =>
      unitRegistryInstance
        .getByTile(world.get(x, y))
        .filter(
          (unit) => unit.player() === player && unit.sourceClass().name === name
        ),
    localTile = playerWorldRegistryInstance
      .getByPlayer(localPlayer)
      .entries()[0]
      .tile(),
    unitPatchBatchesBefore = (sent.gameDataPatch ?? []).length;

  trigger('cheat', {
    name: 'CreateUnit',
    value: { unitType: 'Warrior', x: localTile.x(), y: localTile.y() },
  });

  const [localUnit] = unitAt(
    localPlayer,
    localTile.x(),
    localTile.y(),
    'Warrior'
  );

  assert(!!localUnit, 'CreateUnit with no player should create a unit for us');
  assert(
    (sent.gameDataPatch ?? [])
      .slice(unitPatchBatchesBefore)
      .flat()
      .some((patch: DataPatch) =>
        JSON.stringify(patch).includes(localUnit.id())
      ),
    'the human should receive a patch for its own created unit'
  );

  const rivalTile = playerWorldRegistryInstance
    .getByPlayer(rival)
    .entries()[0]
    .tile();

  trigger('cheat', {
    name: 'CreateUnit',
    value: {
      unitType: 'Settlers',
      x: rivalTile.x(),
      y: rivalTile.y(),
      player: rival.id(),
    },
  });

  assert(
    unitAt(rival, rivalTile.x(), rivalTile.y(), 'Settlers').length === 1,
    'CreateUnit with a rival id should create the unit for the rival'
  );

  // Invalid input creates nothing.
  const unitCount = unitRegistryInstance.entries().length;

  [
    { unitType: 'NoSuchUnit', x: 0, y: 0 },
    { unitType: 'Barracks', x: 0, y: 0 },
    { unitType: 'Warrior', x: world.width(), y: 0 },
    { unitType: 'Warrior', x: 0, y: -1 },
    { unitType: 'Warrior', x: 0, y: 0, player: 'no-such-player' },
  ].forEach((value) => trigger('cheat', { name: 'CreateUnit', value }));

  assert(
    unitRegistryInstance.entries().length === unitCount,
    'invalid CreateUnit input should create nothing'
  );

  // 8. RevealMap adds every unseen tile to the player's map under `tiles`, where the page reads it, as seeing a tile
  //    does (#342).
  const localWorld = playerWorldRegistryInstance.getByPlayer(localPlayer),
    unseen = world.entries().filter((tile) => !localWorld.includes(tile)),
    revealBatchesBefore = (sent.gameDataPatch ?? []).length;

  assert(
    unseen.length > 0,
    'every tile is already seen (test assumption broke)'
  );

  trigger('cheat', { name: 'RevealMap', value: null });

  (
    clientRegistryInstance
      .entries()
      .find((client) => client instanceof DataTransferClient) as any
  ).sendPatchData();

  const revealIndexes = (sent.gameDataPatch ?? [])
    .slice(revealBatchesBefore)
    .flat()
    .filter((patch: DataPatch) => localWorld.id() in patch)
    .map((patch: DataPatch) => String(patch[localWorld.id()].index));

  assert(
    unseen.every((tile) => localWorld.includes(tile)),
    "RevealMap should add every tile to the player's map"
  );
  const expectedIndexes = unseen.map(
    (tile) =>
      `tiles[${localWorld.entries().indexOf(localWorld.getByTile(tile)!)}]`
  );

  assert(
    expectedIndexes.every((index) => revealIndexes.includes(index)) &&
      revealIndexes.every((index) => /^tiles\[\d+\]$/.test(index)),
    `RevealMap should patch each revealed tile under tiles[…], got ${JSON.stringify(
      revealIndexes.slice(0, 3)
    )}`
  );

  console.log(
    'PASS cheats (cheatPlayers and cheatAdvances listings, GrantGold and GrantAdvance target rivals correctly, CreateUnit places units for any player, RevealMap patches the map where the page reads it)'
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
