// The Top Cities in the World report (#124) is worked out in the worker and sent as finished rows. This checks the
//  ranking (score, ties, the limit) and what is known about each city (`topCitiesEntries`) with plain data, then, in a seeded game driven through a human
//  `DataTransferClient` as `civilDisorder` does, that a row names only what the player is allowed to know: your own
//  city in full; a rival city whose tile you haven't seen as "Unknown city"; an unmet civilization as unknown; and no
//  row carrying an id, a tile or a score.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';
import './lib/spawnedClients';

import {
  TopCitiesDependencies,
  TopCitiesEntry,
  rankCities,
  topCitiesEntries,
  topCitiesRows,
} from '../../src/js/Engine/lib/topCities';
import Happiness from '@civ-clone/base-city-yield-happiness/Happiness';
import Unhappiness from '@civ-clone/base-city-yield-unhappiness/Unhappiness';
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

// What the player knows about each city, read through the registries it is given, so plain stand-ins will do: the
//  reader's own city in full, a city taken from its founder on a tile the reader hasn't seen, and an unmet player's
//  city it has seen.
const checkEntries = (): void => {
  const civilization = (name: string, colors: [string, string] | null) => ({
      sourceClass: () => ({ name }),
      attributes: () =>
        colors === null ? [] : [{ name: () => 'colors', value: () => colors }],
    }),
    player = (name: string, colors: [string, string] | null): Player =>
      ({
        civilization: () => civilization(name, colors),
      } as unknown as Player),
    reader = player('Babylonian', ['#fff', '#000']),
    met = player('Roman', null),
    unmet = player('Zulu', ['#0f0', '#000']),
    yieldOf = (YieldType: typeof Happiness, value: number) =>
      Object.assign(Object.create(YieldType.prototype), {
        value: () => value,
      }),
    seenTile = {},
    unseenTile = {},
    city = (
      name: string,
      owner: Player,
      original: Player,
      tile: object,
      size: number,
      yields: unknown[],
      specialists: string[],
      wonders: string[]
    ) => {
      const created: any = {
        name: () => name,
        player: () => owner,
        originalPlayer: () => original,
        tile: () => tile,
        yields: () => yields,
      };

      created.growth = { city: () => created, size: () => size };
      created.specialists = specialists.map((type) => ({
        sourceClass: () => ({ name: type }),
      }));
      created.wonders = wonders.map((type) => ({
        sourceClass: () => ({ name: type }),
      }));

      return created;
    },
    cities = [
      // Size 3, one Entertainer and one Happiness: one happy, one content.
      city(
        'Babylon',
        reader,
        reader,
        seenTile,
        3,
        [yieldOf(Happiness, 1)],
        ['Entertainer'],
        ['Colossus']
      ),
      // Size 4 with two Unhappiness: two content, two unhappy.
      city(
        'Zimbabwe',
        met,
        unmet,
        unseenTile,
        4,
        [yieldOf(Unhappiness, 2)],
        [],
        []
      ),
      city('Ulundi', unmet, unmet, seenTile, 1, [], [], []),
      // A second city of an owner already asked about, so that asking once per owner takes a cache (#503).
      city('Antium', met, met, seenTile, 2, [], [], []),
    ],
    asked: string[] = [],
    dependencies = {
      cities: { entries: () => cities },
      cityGrowths: { getByCity: (city: any) => city.growth },
      specialists: { getByCity: (city: any) => city.specialists },
      wonders: { getByCity: (city: any) => city.wonders },
      playerWorlds: {
        getByPlayer: (owner: Player) => {
          if (owner !== reader) {
            fail("topCitiesEntries read a world other than the reader's");
          }

          return {
            getByTile: (tile: object) => (tile === seenTile ? tile : null),
          };
        },
      },
      hasMet: (other: Player) => {
        asked.push(other.civilization().sourceClass().name);

        return other === reader || other === met;
      },
    } as unknown as TopCitiesDependencies,
    entries = topCitiesEntries(reader, dependencies),
    expected: TopCitiesEntry[] = [
      {
        name: 'Babylon',
        originalCivilization: 'Babylonian',
        owner: { civilization: 'Babylonian', colors: ['#fff', '#000'] },
        size: 3,
        citizens: {
          happy: 1,
          content: 1,
          unhappy: 0,
          specialists: ['Entertainer'],
        },
        wonders: ['Colossus'],
        seen: true,
        met: true,
      },
      {
        name: 'Zimbabwe',
        originalCivilization: 'Zulu',
        owner: { civilization: 'Roman', colors: null },
        size: 4,
        citizens: { happy: 0, content: 2, unhappy: 2, specialists: [] },
        wonders: [],
        seen: false,
        met: true,
      },
      {
        name: 'Ulundi',
        originalCivilization: 'Zulu',
        owner: { civilization: 'Zulu', colors: ['#0f0', '#000'] },
        size: 1,
        citizens: { happy: 0, content: 1, unhappy: 0, specialists: [] },
        wonders: [],
        seen: true,
        met: false,
      },
      {
        name: 'Antium',
        originalCivilization: 'Roman',
        owner: { civilization: 'Roman', colors: null },
        size: 2,
        citizens: { happy: 0, content: 2, unhappy: 0, specialists: [] },
        wonders: [],
        seen: true,
        met: true,
      },
    ];

  if (JSON.stringify(entries) !== JSON.stringify(expected)) {
    fail(
      `topCitiesEntries gave ${JSON.stringify(
        entries
      )}, expected ${JSON.stringify(expected)}`
    );
  }

  if (asked.join(',') !== 'Babylonian,Roman,Zulu') {
    fail(`hasMet was asked about ${asked.join(',')}, not once per owner`);
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
  checkEntries();

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

  const ownCivilization = humanClient!
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
