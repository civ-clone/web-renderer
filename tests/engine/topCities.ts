// The Top Cities in the World report (#124) is worked out in the worker and sent as finished rows. This checks the
//  ranking (score, ties, the limit) with plain data, then, in a seeded game driven through a human
//  `DataTransferClient` as `civilDisorder` does, that a row names only what the player is allowed to know: your own
//  city in full; a rival city whose tile you haven't seen as "Unknown city"; an unmet civilization as unknown; and no
//  row carrying an id, a tile or a score.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';

import {
  TopCitiesEntry,
  rankCities,
  topCitiesRows,
} from '../../src/js/Engine/lib/topCities';
import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import City from '@civ-clone/core-city/City';
import DataTransferClient from '../../src/js/Engine/DataTransferClient';
import Player from '@civ-clone/core-player/Player';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import { Settlers } from '@civ-clone/civ1-unit/Units';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';

let started = false,
  humanPlayer: Player | null = null,
  humanClient: DataTransferClient | null = null,
  helper: SimpleAIClient | null = null,
  actionHandler: ((action: any) => unknown) | null = null,
  topCitiesHandler: ((limit: number) => unknown) | null = null,
  topCitiesSent: any = null,
  pendingChoice: ((value: any) => void) | null = null;

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `FAIL topCities: ${reason}\n${
      error instanceof Error ? error.stack : String(error ?? '')
    }\n`
  );
  process.exit(1);

  throw new Error(reason);
};

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 50));

const entry = (
  name: string,
  size: number,
  happy: number,
  unhappy: number,
  wonders: number = 0
): TopCitiesEntry => ({
  name,
  originalCivilization: 'Babylonian',
  owner: { civilization: 'Babylonian', colors: null },
  size,
  citizens: {
    happy,
    content: size - happy - unhappy,
    unhappy,
    specialists: [],
  },
  wonders: new Array(wonders).fill('Colossus'),
  seen: true,
  met: true,
});

const checkRanking = (): void => {
  const names = (entries: TopCitiesEntry[]) =>
      entries.map(({ name }) => name).join(','),
    // Scores: a 3 + 1 - 0 = 4; b 4 + 0 - 2 = 2; c 1 + 0 - 0 + 10 = 11; d 2 + 2 - 0 = 4 (ties with a, founded later);
    //  e 1.
    entries = [
      entry('a', 3, 1, 0),
      entry('b', 4, 0, 2),
      entry('c', 1, 0, 0, 1),
      entry('d', 2, 2, 0),
      entry('e', 1, 0, 0),
    ];

  if (names(rankCities(entries)) !== 'c,a,d,b,e') {
    fail(
      `ranked ${names(
        rankCities(entries)
      )}, expected c,a,d,b,e (score, then founding order)`
    );
  }

  if (names(rankCities(entries, 2)) !== 'c,a') {
    fail(`the limit of 2 gave ${names(rankCities(entries, 2))}`);
  }

  const [row] = topCitiesRows([
    { ...entry('x', 1, 0, 0), seen: false, met: false },
  ]);

  if (row.city !== null || row.owner !== null || row.rank !== 1) {
    fail(`an unseen, unmet city's row was ${JSON.stringify(row)}`);
  }
};

// Any key in the rows that could tie a row to an object, a place or the hidden score.
const leakedKeys = (value: any, path: string = 'rows'): string[] =>
  value === null || typeof value !== 'object'
    ? []
    : Object.entries(value).flatMap(([key, child]) => [
        ...(['id', 'tile', 'x', 'y', 'score', 'player', '_'].includes(key)
          ? [`${path}.${key}`]
          : []),
        ...leakedKeys(child, `${path}.${key}`),
      ]);

const rowFor = (
  rows: any[],
  name: string | null,
  civilization: string | null
) =>
  rows.find(
    (row) =>
      (row.city?.name ?? null) === name &&
      (row.owner?.civilization ?? null) === civilization
  );

const run = async (): Promise<void> => {
  checkRanking();

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

  const [ownCity] = cityRegistryInstance.getByPlayer(humanPlayer!);

  if (!ownCity) {
    fail('the starting Settlers could not found a city');
  }

  const humanWorld = playerWorldRegistryInstance.getByPlayer(humanPlayer!),
    rival = playerRegistryInstance
      .entries()
      .find(
        (player) =>
          player !== humanPlayer &&
          unitRegistryInstance
            .getByPlayer(player)
            .some(
              (unit) =>
                unit instanceof Settlers &&
                humanWorld.getByTile(unit.tile()) === null
            )
      );

  if (!rival) {
    fail("no rival has Settlers on a tile the human hasn't seen");
  }

  const rivalTile = unitRegistryInstance
      .getByPlayer(rival!)
      .find(
        (unit) =>
          unit instanceof Settlers && humanWorld.getByTile(unit.tile()) === null
      )!
      .tile(),
    rivalCity = new City(rival!, rivalTile, 'Hiddenville');

  if (cityRegistryInstance.entries().indexOf(rivalCity) === -1) {
    fail('the rival city was not registered');
  }

  // Asked through the transport, as the report does.
  topCitiesHandler!(10);

  const sent = topCitiesSent;

  if (!Array.isArray(sent) || sent.length === 0) {
    fail(`the topCities request sent ${JSON.stringify(sent)}`);
  }

  if (leakedKeys(sent).length > 0) {
    fail(`the rows carry ${leakedKeys(sent).join(', ')}`);
  }

  const ownCivilization = (humanClient as any)
    .player()
    .civilization()
    .sourceClass().name;

  if (!rowFor(sent, ownCity.name(), ownCivilization)) {
    fail(`your own city is not named in full: ${JSON.stringify(sent)}`);
  }

  if (!rowFor(sent, null, null)) {
    fail(
      `the unseen rival city of an unmet civilization is not anonymous: ${JSON.stringify(
        sent
      )}`
    );
  }

  if (sent.some((row: any) => row.city?.name === 'Hiddenville')) {
    fail('the unseen rival city is named');
  }

  // Seeing the city's tile names it, and (as for alerts, #59) counts as meeting its owner.
  humanWorld.register(rivalTile);

  const seen = rows(10),
    rivalName = rival!.civilization().sourceClass().name;

  if (!rowFor(seen, 'Hiddenville', rivalName)) {
    fail(
      `the rival city is not named once its tile is seen: ${JSON.stringify(
        seen
      )}`
    );
  }

  // A second city of the now-met rival, on a tile the human hasn't seen: its owner is named, the city isn't.
  const elsewhere = rivalTile
    .getSurroundingArea(3)
    .entries()
    .find((tile) => humanWorld.getByTile(tile) === null && !tile.isWater());

  if (!elsewhere) {
    fail('no unseen land tile near the rival city for a second one');
  }

  new City(rival!, elsewhere!, 'Fartown');

  if (!rowFor(rows(10), null, rivalName)) {
    fail(
      `a met civilization's unseen city doesn't read as its owner's: ${JSON.stringify(
        rows(10)
      )}`
    );
  }

  if (rows(1).length !== 1) {
    fail(`a limit of 1 gave ${rows(1).length} rows`);
  }

  console.log(
    'PASS topCities (ranking, the limit, and only what the player has seen or met is named)'
  );

  process.exit(0);
};

const rows = (limit: number): any[] =>
  JSON.parse(JSON.stringify(humanClient!.topCities(limit)));

const transport = {
  receive: (channel: string, handler: (...args: any[]) => unknown) => {
    if (channel === 'action') {
      actionHandler = handler;
    }

    if (channel === 'topCities') {
      topCitiesHandler = handler;
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

    if (channel === 'topCities') {
      topCitiesSent = JSON.parse(JSON.stringify(data));

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
