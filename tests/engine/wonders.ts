// The Wonders of the World report (F7, #992) is worked out in the worker and sent as finished rows, as the Top Cities
//  are (#124). This checks the rows with plain data (standing, captured, lost, an unmet owner, an unseen city, your own,
//  the order and none at all), what is known about each Wonder (`wondersEntries`) with stand-ins, then, in a seeded game
//  driven through a human `DataTransferClient` as `topCities` does, the rows sent on the `wonders` channel: in Civ1's
//  order (#971's `wonderHistory`) rather than the order they were built, a Wonder lost with its captured city listed as
//  destroyed, and nothing that ties a row to an object.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';
import './lib/spawnedClients';

import {
  BuiltWonder,
  WondersDependencies,
  WondersEntry,
  builtWonders,
  wondersEntries,
  wondersRows,
} from '@civ-clone/ui-worker-client/lib/wonders';
import {
  Colossus,
  GreatLibrary,
  Pyramids,
} from '@civ-clone/civ1-wonder/Wonders';
import {
  setWorkerRules,
  workerRules,
} from '@civ-clone/ui-worker-client/workerRules';
import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import City from '@civ-clone/core-city/City';
import DataTransferClient from '@civ-clone/ui-worker-client/DataTransferClient';
import Player from '@civ-clone/core-player/Player';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import { Settlers } from '@civ-clone/civ1-unit/Units';
import { WondersRow } from '@civ-clone/ui-protocol/reports';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';
import { instance as wonderRegistryInstance } from '@civ-clone/core-wonder/WonderRegistry';

let started = false,
  checks = 0,
  humanPlayer: Player | null = null,
  helper: SimpleAIClient | null = null,
  actionHandler: ((action: any) => unknown) | null = null,
  wondersHandler: ((value: null) => unknown) | null = null,
  wondersSent: any = null,
  pendingChoice: ((value: any) => void) | null = null;

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `FAIL wonders: ${reason}\n${
      error instanceof Error ? error.stack : String(error ?? '')
    }\n`
  );
  process.exit(1);

  throw new Error(reason);
};

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(
      `${description}\n    expected: ${JSON.stringify(
        expected
      )}\n    actual:   ${JSON.stringify(actual)}`
    );
  }
};

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 50));

const standing = (
  wonder: string,
  {
    name = 'Thebes',
    originalCivilization = 'Egyptian',
    owner = 'Egyptian',
    colors = ['#fff', '#000'] as [string, string] | null,
    own = false,
    seen = true,
    met = true,
  } = {}
): WondersEntry => ({
  wonder,
  city: {
    name,
    originalCivilization,
    owner: { civilization: owner, colors },
    own,
    seen,
    met,
  },
});

const checkRows = (): void => {
  expect('no Wonder built: no rows', wondersRows([]), []);

  expect(
    'a standing Wonder: its city by its founder, and its owner now',
    wondersRows([standing('Pyramids')]),
    [
      {
        wonder: 'Pyramids',
        destroyed: false,
        own: false,
        city: { name: 'Thebes', civilization: 'Egyptian' },
        owner: { civilization: 'Egyptian', colors: ['#fff', '#000'] },
      },
    ] as WondersRow[]
  );

  expect(
    'a captured Wonder goes with its city: the founder names the city, the captor owns it',
    wondersRows([
      standing('Colossus', { owner: 'Roman', colors: ['#f00', '#fff'] }),
    ]).map(({ city, owner }) => [city, owner]),
    [
      [
        { name: 'Thebes', civilization: 'Egyptian' },
        { civilization: 'Roman', colors: ['#f00', '#fff'] },
      ],
    ]
  );

  expect(
    "lost Wonders: destroyed, with no city, no owner and nobody's",
    wondersRows([
      { wonder: 'Colossus', city: null },
      { wonder: 'Lighthouse', city: null },
    ]),
    [
      {
        wonder: 'Colossus',
        destroyed: true,
        own: false,
        city: null,
        owner: null,
      },
      {
        wonder: 'Lighthouse',
        destroyed: true,
        own: false,
        city: null,
        owner: null,
      },
    ]
  );

  expect(
    "an unmet owner isn't named; a city you haven't seen isn't either",
    wondersRows([
      standing('Pyramids', { met: false }),
      standing('Colossus', { seen: false }),
      standing('Lighthouse', { seen: false, met: false }),
    ]).map(({ wonder, city, owner }) => [
      wonder,
      city?.name ?? null,
      owner?.civilization ?? null,
    ]),
    [
      ['Pyramids', 'Thebes', null],
      ['Colossus', null, 'Egyptian'],
      ['Lighthouse', null, null],
    ]
  );

  expect(
    'your own: marked, and always named',
    wondersRows([
      standing('Pyramids', { own: true, seen: false, met: false }),
      standing('Colossus'),
    ]).map(({ own, city, owner }) => [own, city?.name, owner?.civilization]),
    [
      [true, 'Thebes', 'Egyptian'],
      [false, 'Thebes', 'Egyptian'],
    ]
  );

  expect(
    'in the order the entries come, lost ones in their place',
    wondersRows([
      standing('Pyramids'),
      { wonder: 'HangingGardens', city: null },
      standing('Lighthouse'),
    ]).map(({ wonder }) => wonder),
    ['Pyramids', 'HangingGardens', 'Lighthouse']
  );
};

// What the reader knows of each Wonder, read through the registries it is given, so plain stand-ins will do.
const checkEntries = (): void => {
  const rules = workerRules();

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
    captor = player('Roman', null),
    unmet = player('Zulu', ['#0f0', '#000']),
    seenTile = {},
    unseenTile = {},
    city = (name: string, owner: Player, original: Player, tile: object) =>
      ({
        name: () => name,
        player: () => owner,
        originalPlayer: () => original,
        tile: () => tile,
      } as unknown as City),
    // Standing in a city, and whose the rules say it is now.
    standingIn = (
      cityName: string,
      owner: Player,
      original: Player,
      tile: object
    ) => ({ city: city(cityName, owner, original, tile), owner }),
    built: BuiltWonder[] = [
      {
        wonder: 'Pyramids',
        standing: standingIn('Babylon', reader, reader, unseenTile),
      },
      // Founded by the Zulus, taken by the Romans: the Romans own its Wonder now.
      {
        wonder: 'Colossus',
        standing: standingIn('Ulundi', captor, unmet, seenTile),
      },
      {
        wonder: 'Lighthouse',
        standing: standingIn('Zimbabwe', unmet, unmet, seenTile),
      },
      {
        wonder: 'GreatWall',
        standing: standingIn('Antium', captor, captor, unseenTile),
      },
      { wonder: 'Oracle', standing: null },
    ],
    asked: string[] = [],
    dependencies = {
      playerWorlds: {
        getByPlayer: (owner: Player) => {
          if (owner !== reader) {
            fail("wondersEntries read a world other than the reader's");
          }

          return {
            getByTile: (tile: object) => (tile === seenTile ? tile : null),
          };
        },
      },
      hasMet: (other: Player) => {
        asked.push(other.civilization().sourceClass().name);

        return other === captor;
      },
    } as unknown as WondersDependencies;

  expect(
    'wondersEntries: the owner now, the founder, and what the reader has seen and met',
    wondersEntries(reader, built, dependencies),
    [
      {
        wonder: 'Pyramids',
        city: {
          name: 'Babylon',
          originalCivilization: 'Babylonian',
          owner: { civilization: 'Babylonian', colors: ['#fff', '#000'] },
          own: true,
          seen: false,
          met: true,
        },
      },
      {
        wonder: 'Colossus',
        city: {
          name: 'Ulundi',
          originalCivilization: 'Zulu',
          owner: { civilization: 'Roman', colors: null },
          own: false,
          seen: true,
          met: true,
        },
      },
      {
        wonder: 'Lighthouse',
        city: {
          name: 'Zimbabwe',
          originalCivilization: 'Zulu',
          owner: { civilization: 'Zulu', colors: ['#0f0', '#000'] },
          own: false,
          seen: true,
          met: false,
        },
      },
      {
        wonder: 'GreatWall',
        city: {
          name: 'Antium',
          originalCivilization: 'Roman',
          owner: { civilization: 'Roman', colors: null },
          own: false,
          seen: false,
          met: true,
        },
      },
      { wonder: 'Oracle', city: null },
    ] as WondersEntry[]
  );
  expect('hasMet is asked once per owner, never about the reader', asked, [
    'Roman',
    'Zulu',
  ]);

  expect(
    "an observer's view owns what it says it owns (#607)",
    wondersEntries(reader, built.slice(0, 2), {
      ...dependencies,
      owns: (owner: Player) => owner === captor,
    }).map((entry) => entry.city?.own),
    [false, true]
  );

  // The rule set's history, as it gives it: a lost Wonder's destroyed city and a never-built one are passed on to no
  //  one.
  const delphi = city('Delphi', captor, captor, seenTile),
    carthage = city('Carthage', unmet, unmet, seenTile);

  setWorkerRules({
    ...workerRules(),
    wonderHistory: () =>
      [
        {
          type: { name: 'Oracle' },
          state: 'standing',
          city: delphi,
          owner: captor,
        },
        {
          type: { name: 'Colossus' },
          state: 'lost',
          city: carthage,
          owner: null,
        },
        {
          type: { name: 'Lighthouse' },
          state: 'never',
          city: null,
          owner: null,
        },
      ] as any,
  });

  const fromHistory = builtWonders({} as any);

  expect(
    "builtWonders: the rule set's history, a standing Wonder with its city and owner, a lost one with neither, a never-built one left out",
    fromHistory.map(({ wonder, standing }) => [
      wonder,
      standing?.city === delphi,
      standing?.owner === captor,
      standing === null,
    ]),
    [
      ['Oracle', true, true, false],
      ['Colossus', false, false, true],
    ]
  );

  setWorkerRules(rules);
};

// Any key in the rows that could tie a row to an object or a place.
const leakedKeys = (value: any, path: string = 'rows'): string[] =>
  value === null || typeof value !== 'object'
    ? []
    : Object.entries(value).flatMap(([key, child]) => [
        ...(['id', 'tile', 'x', 'y', 'player', '_'].includes(key)
          ? [`${path}.${key}`]
          : []),
        ...leakedKeys(child, `${path}.${key}`),
      ]);

const run = async (): Promise<void> => {
  checkRows();
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

  // Asked before any is built: no rows.
  wondersHandler!(null);
  await settle();

  expect('none built yet: no rows', wondersSent, []);

  // Two of ours, built the other way round from Civ1's order (the Great Library is its 5th, the Pyramids its 1st), as
  //  `building-complete` registers them.
  wonderRegistryInstance.register(
    new GreatLibrary(ownCity!),
    new Pyramids(ownCity!)
  );

  // And a rival's Colossus, lost with its city: a size-1 city captured is destroyed (civ1-city), and its Wonder with it.
  const [rival, captor] = playerRegistryInstance
      .entries()
      .filter((player) => player !== humanPlayer),
    site = ownCity!
      .tile()
      .getSurroundingArea(4)
      .entries()
      .find(
        (tile) =>
          !tile.isWater() &&
          tile.distanceFrom(ownCity!.tile()) > 2 &&
          cityRegistryInstance.getByTile(tile) === null
      );

  if (!rival || !captor || !site) {
    fail('no rival, captor or site for the lost Colossus');
  }

  const lost = new City(rival!, site!, 'Lostville');

  wonderRegistryInstance.register(new Colossus(lost));
  lost.capture(captor!);

  if (!lost.destroyed() || wonderRegistryInstance.getByCity(lost).length > 0) {
    fail('the Colossus was not lost with its city');
  }

  wondersHandler!(null);
  await settle();

  if (leakedKeys(wondersSent).length > 0) {
    fail(`the rows carry ${leakedKeys(wondersSent).join(', ')}`);
  }

  const civilization = humanPlayer!.civilization().sourceClass().name;

  expect(
    "asked over the transport: in Civ1's order, not the order built, the lost Colossus destroyed and nobody's",
    (wondersSent as WondersRow[]).map(
      ({ wonder, own, destroyed, city, owner }) => [
        wonder,
        own,
        destroyed,
        city?.name ?? null,
        owner?.civilization ?? null,
      ]
    ),
    [
      ['Pyramids', true, false, ownCity!.name(), civilization],
      ['Colossus', false, true, null, null],
      ['GreatLibrary', true, false, ownCity!.name(), civilization],
    ]
  );

  console.log(`PASS wonders (${checks} checks)`);

  process.exit(0);
};

const transport = {
  receive: (channel: string, handler: (...args: any[]) => unknown) => {
    if (channel === 'action') {
      actionHandler = handler;
    }

    if (channel === 'wonders') {
      wondersHandler = handler;
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

    if (channel === 'wonders') {
      wondersSent = JSON.parse(JSON.stringify(data));

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
