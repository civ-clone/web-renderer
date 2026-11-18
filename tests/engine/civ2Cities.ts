// What Civ2's rules send the interface about its cities (M2c, #1007), with the civ2 set loaded as a game loads it and
//  rules-civ2's AdditionalData registered:
//
// - the citizens' moods worked out in Civ2's stages, with the counts after each (`citizens.stages`), and the worker
//   rules' `citizenMoods` from the same calculator;
// - what each square in a city's radius yields it (`squareYields`): a Harbour's ocean square differs from its own;
// - the city's style row and citizens' row by its owner's advances, and a capital drawn larger (`style`);
// - the specialists the city may have (`specialistsAvailable`: Entertainers only below size 5);
// - the gold Capitalization makes (`goldPerTurn`), and the build list's progress after a change (`buildItemDetails`):
//   a person's change across categories halves it, and changing back the same turn restores it;
// - the Auto mode (`autoMode`), and the worker rules' `autoBuild` putting a city on Auto in a mode;
// - a rival's city, sent as a stand-in, with its style;
// - whether a city is walled (#688, #1069): City Walls, or its owner's Great Wall, a rival's too.

import './lib/seed';
import '@civ-clone/ui-worker-client/Game';
import {
  Automobile,
  CeremonialBurial,
  Corporation,
  Electronics,
  Industrialization,
  Invention,
  Metallurgy,
  Philosophy,
} from '@civ-clone/civ2-science/Advances';
import {
  CityWalls,
  Harbour,
  Palace,
  Temple,
} from '@civ-clone/civ2-city-improvement/CityImprovements';
import { Grassland, Ocean } from '@civ-clone/civ2-world/Terrains';
import { Musketman, Settlers, Warrior } from '@civ-clone/civ2-unit/Units';
import Capitalization from '@civ-clone/base-city-improvement-capitalization/Capitalization';
import City from '@civ-clone/core-city/City';
import Client from '@civ-clone/core-client/Client';
import { Colossus, GreatWall } from '@civ-clone/civ2-wonder/Wonders';
import FillGenerator from '@civ-clone/simple-world-generator/tests/lib/FillGenerator';
import Player from '@civ-clone/core-player/Player';
import PlayerWorld from '@civ-clone/core-player-world/PlayerWorld';
import Tile from '@civ-clone/core-world/Tile';
import { Greek, Roman } from '@civ-clone/civ2-civilization/Civilizations';
import { Gold, Production } from '@civ-clone/civ2-city/Yields';
import processCityYields from '@civ-clone/base-player/lib/processCityYields';
import {
  unknownCityOf,
  unknownUnitOf,
} from '@civ-clone/ui-worker-client/Client/standIns';
import { playerView } from '@civ-clone/ui-worker-client/Client/View';
import { registerPatchEvents } from '@civ-clone/ui-worker-client/Client/events/patchEvents';
import Added from '@civ-clone/core-player/Rules/Added';
import UnknownCity from '@civ-clone/ui-worker-client/UnknownObjects/City';
import World from '@civ-clone/core-world/World';
import { instance as additionalDataRegistryInstance } from '@civ-clone/core-data-object/AdditionalDataRegistry';
import { defaultGame } from '@civ-clone/core-game/defaultGame';
import { drawnLarger } from '@civ-clone/ui-rules-civ2/lib/cityStyle';
import pluginSets from '../../src/js/pluginSets';
import { pluginsFrom } from '@civ-clone/ui-worker-client/Plugins';
import stagedHappiness from '@civ-clone/civ2-city-happiness/lib/stagedHappiness';
import { citizenSummary } from '@civ-clone/base-city-happiness/lib/calculateCitizenState';
import { workerRules } from '@civ-clone/ui-worker-client/workerRules';

const failures: string[] = [];
let checks = 0,
  finished = false;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  const [a, e] = [actual, expected].map((value) => JSON.stringify(value));

  if (a !== e) {
    failures.push(`${description}\n    expected: ${e}\n    actual:   ${a}`);
  }
};

// A run that stops before it reports has checked nothing (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write('FAIL civ2Cities: stopped before the checks ran\n');
    process.exitCode = 1;
  }
});

// The key's value for `object`, as the client's payload would carry it.
const additional = (object: any, key: string): any =>
  additionalDataRegistryInstance
    .getByType(object.sourceClass())
    .find((additionalData) => additionalData.key() === key)
    ?.data(object);

const run = async (): Promise<void> => {
  // Grassland with a column of Ocean at x 5, built before the rules are in, as are the cities.
  class Map extends FillGenerator {
    generate() {
      return Promise.resolve(
        new Array(60 * 40)
          .fill(0)
          .map((value, index) =>
            index % 60 === 5 ? new Ocean() : new Grassland()
          )
      );
    }
  }

  const world = await new World(
      new Map(60, 40, Grassland),
      defaultGame.rules,
      defaultGame.landMasses
    ).build(),
    addPlayer = () => {
      const player = new Player(defaultGame.rules);

      // Its research, trade rates, treasury and government come from the rules, once they're in (`Added`, below).
      defaultGame.players.register(player);
      defaultGame.playerWorlds.register(
        new PlayerWorld(player, world, defaultGame.rules)
      );

      return player;
    },
    us = addPlayer(),
    them = addPlayer(),
    addCity = (player: Player, tile: Tile, name: string) => {
      // The rules' `Created` registers it, its growth and its build, and gives it its squares.
      return new City(player, tile, name, defaultGame.rules);
    };

  await pluginsFrom(pluginSets)
    .sets.find(({ id }) => id === 'civ2')!
    .load();
  await import('@civ-clone/ui-rules-civ2');

  // What the rules give a player as it joins (its trade rates, treasury and government), as a game's players have, and
  //  the cities founded once the rules are in, so they have their squares.
  [us, them].forEach((player, index) => {
    player.setCivilization(index === 0 ? new Roman() : new Greek());
    defaultGame.rules.process(Added, player);
  });

  // Next to the column of Ocean.
  const [shore] = world
      .tiles()
      .filter(
        (tile: Tile) =>
          !(tile.terrain() instanceof Ocean) &&
          tile
            .getNeighbours()
            .some((neighbour: Tile) => neighbour.terrain() instanceof Ocean)
      ),
    coastal = addCity(us, shore, 'Coastal'),
    inland = addCity(us, world.get(20, 20), 'Inland'),
    theirs = addCity(them, world.get(30, 30), 'Theirs');

  // Moods and stages.

  const citizens = additional(coastal, 'citizens');

  expect(
    "the stages of a city's happiness, in Civ2's order",
    citizens.stages.map(({ name }: { name: string }) => name),
    ['base', 'luxuries', 'buildings', 'units', 'wonders']
  );
  expect(
    "the worker rules' moods are the staged calculator's",
    workerRules().citizenMoods(
      defaultGame.cityGrowth.getByCity(coastal),
      defaultGame.specialists
    ),
    citizenSummary(stagedHappiness(coastal).states)
  );

  // What a square yields its city.

  // The ocean square nearest the city.
  const [oceanSquare] = coastal
      .tiles()
      .entries()
      .filter((tile: Tile) => tile.terrain() instanceof Ocean)
      .sort(
        (a: Tile, b: Tile) =>
          a.distanceFrom(coastal.tile()) - b.distanceFrom(coastal.tile())
      ),
    ownYields = (tile: Tile) =>
      tile.yields(us).reduce(
        (total: { [name: string]: number }, tileYield) => ({
          ...total,
          [tileYield.constructor.name]:
            (total[tileYield.constructor.name] ?? 0) + tileYield.value(),
        }),
        {}
      ),
    squareOf = (city: City, tile: Tile) =>
      (
        additional(city, 'squareYields') as {
          x: number;
          y: number;
          yields: { _: string; value: number }[];
        }[]
      )
        .find(({ x, y }) => x === tile.x() && y === tile.y())!
        .yields.reduce(
          (total: { [name: string]: number }, { _, value }) => ({
            ...total,
            [_]: (total[_] ?? 0) + value,
          }),
          {}
        );

  expect(
    "every square in the city's radius is sent",
    additional(coastal, 'squareYields').length,
    coastal.tiles().entries().length
  );
  expect(
    'without a Harbour, the ocean square yields the city what it yields on its own',
    squareOf(coastal, oceanSquare),
    ownYields(oceanSquare)
  );

  defaultGame.cityImprovements.register(
    new Harbour(coastal, defaultGame.rules)
  );

  expect(
    'with a Harbour, 1 food more for the city than the square yields on its own',
    squareOf(coastal, oceanSquare).Food - ownYields(oceanSquare).Food,
    1
  );

  // Styles by era.

  const research = defaultGame.playerResearch.getByPlayer(us),
    styleOf = () => additional(inland, 'style');

  expect('to begin with: ancient', styleOf(), {
    era: 'ancient',
    people: 'ancient',
    larger: false,
  });

  research.addAdvance(Invention);
  research.addAdvance(Philosophy);

  expect(
    'Invention and Philosophy: the citizens are renaissance, the city still ancient',
    styleOf(),
    { era: 'ancient', people: 'renaissance', larger: false }
  );

  research.addAdvance(Industrialization);

  expect('Industrialization: both industrial', styleOf(), {
    era: 'industrial',
    people: 'industrial',
    larger: false,
  });

  research.addAdvance(Automobile);

  expect('Automobile alone: still industrial', styleOf().era, 'industrial');

  research.addAdvance(Electronics);

  expect('Automobile and Electronics: both modern', styleOf(), {
    era: 'modern',
    people: 'modern',
    larger: false,
  });

  defaultGame.cityImprovements.register(new Palace(inland, defaultGame.rules));

  expect(
    "a computer player's capital at King isn't drawn larger, a person's is",
    [
      styleOf().larger,
      drawnLarger(inland, {
        clientRegistry: {
          getBy: () => [{}],
        } as any,
      }),
    ],
    [false, true]
  );

  // A rival's city goes as a stand-in, with its style as its owner's advances make it.
  const standIn = UnknownCity.fromCity(theirs);

  expect(
    "a rival's city sent as a stand-in carries its style",
    [standIn.keys().includes('style'), standIn.style()],
    [true, { era: 'ancient', people: 'ancient', larger: false }]
  );

  // Specialists.

  expect(
    'a city below size 5 may have only Entertainers',
    additional(inland, 'specialistsAvailable'),
    ['Entertainer']
  );

  const inlandGrowth = defaultGame.cityGrowth.getByCity(inland);

  while (inlandGrowth.size() < 5) {
    inlandGrowth.grow();
  }

  expect('at size 5, every kind', additional(inland, 'specialistsAvailable'), [
    'Entertainer',
    'TaxCollector',
    'Scientist',
  ]);

  // Capitalization and the change penalty.

  // What the builds below need: Temples, and Capitalization (The Corporation).
  research.addAdvance(CeremonialBurial);
  research.addAdvance(Corporation);

  const build = defaultGame.cityBuilds.getByCity(inland),
    details = (Item: any) =>
      workerRules().buildItemDetails!(build, Item, defaultGame.rules);

  build.build(Warrior);

  expect(
    'building anything else, no gold per turn',
    additional(build, 'goldPerTurn'),
    null
  );

  build.progress().set(10);

  expect(
    "a computer player's change: only to a Wonder is half lost",
    [Temple, Colossus, Settlers].map(
      (Item) => details(Item).progressAfterChange
    ),
    [10, 5, 10]
  );

  // A person's.
  class PersonClient extends Client {}

  defaultGame.clients.register(new PersonClient(us));

  expect(
    "a person's change across categories loses half, within one it keeps all",
    [Temple, Colossus, Settlers].map(
      (Item) => details(Item).progressAfterChange
    ),
    [5, 5, 10]
  );

  build.build(Temple);

  expect(
    'changed to an improvement, the progress is halved, and changing back the same turn would restore it',
    [build.progress().value(), details(Warrior).progressAfterChange],
    [5, 10]
  );

  expect(
    'Capitalization in the build list: the gold it would make each turn',
    typeof details(Capitalization).goldPerTurn,
    'number'
  );

  build.build(Capitalization);

  expect(
    'building Capitalization, its gold per turn, which is what the build list said',
    additional(build, 'goldPerTurn'),
    details(Capitalization).goldPerTurn
  );

  // The engine's own production step pays it: what the treasury gains is what was shown.
  const treasury = defaultGame.playerTreasuries.getByPlayerAndType(us, Gold),
    shown = additional(build, 'goldPerTurn'),
    before = treasury.value();

  processCityYields(
    us,
    [Production],
    {
      getByPlayer: () => [inland],
    } as any,
    defaultGame.rules
  );

  expect(
    "the gold shown is what the city's production step pays, and the box is kept",
    [shown > 0, treasury.value() - before],
    [true, shown]
  );

  // Auto modes.

  expect('not on Auto', additional(build, 'autoMode'), null);

  build.setAuto(true);
  workerRules().autoBuild(build, defaultGame.rules, 'units');

  // What it then chooses is civ2-city's (its scores rank improvements only, so units only keeps the build).
  expect(
    'put on Auto with units only, it says so',
    [additional(build, 'autoMode'), build.auto()],
    ['units', true]
  );

  workerRules().autoBuild(build, defaultGame.rules, 'nonsense');

  expect(
    'a mode it has none of is anything',
    additional(build, 'autoMode'),
    'any'
  );

  // What the client patches (M2c): a changed square's cities, a rival's upgraded unit, and a rival's cities drawn in a
  //  new era.
  {
    defaultGame.playerWorlds
      .getByPlayer(us)
      .register(
        ...world
          .tiles()
          .filter(
            (tile: Tile) =>
              defaultGame.playerWorlds.getByPlayer(us).getByTile(tile) === null
          )
      );

    const view = playerView(() => us, {
        cities: defaultGame.cities,
        interactions: defaultGame.interactions,
        playerWorlds: defaultGame.playerWorlds,
      } as any),
      listeners: { [event: string]: ((...args: any[]) => void)[] } = {},
      // What was queued, in order: an update's value is built when the queue is sent (`emit`, below), as the client's
      //  queue builds it, and one that comes back `undefined` is left out.
      patched: (string | (() => string | null))[] = [];

    registerPatchEvents(
      {
        on: (event: string, listener: (...args: any[]) => void) =>
          (listeners[event] = [...(listeners[event] ?? []), listener]),
        off: () => {},
      } as any,
      {
        view,
        cities: defaultGame.cities,
        units: defaultGame.units,
        cityNews: { of: () => ({}) },
        dataFilter: () => (object: any) => object,
        patches: {
          tile: (tile: any) => tile && patched.push(`tile ${tile.id()}`),
          unit: (unit: any) => patched.push(`unit ${unit.id()}`),
          city: (city: any) => patched.push(`city ${city.name()}`),
          update: (id: string, value: unknown) =>
            patched.push(() =>
              (typeof value === 'function' ? value() : value) === undefined
                ? null
                : `update ${id}`
            ),
          cities: () => patched.push('cities'),
          playerKey: () => {},
          flush: () => {},
        },
      } as any
    );

    // The event raised, then anything `before` the queue is sent (the rules that run after the event is raised), then
    //  what the queue sends.
    const emitThen = (
        before: () => void,
        event: string,
        ...args: unknown[]
      ): string[] => {
        patched.length = 0;
        listeners[event]!.forEach((listener) => listener(...args));
        before();

        return patched
          .map((entry) => (typeof entry === 'function' ? entry() : entry))
          .filter((entry): entry is string => entry !== null);
      },
      emit = (event: string, ...args: unknown[]): string[] =>
        emitThen(() => {}, event, ...args),
      tileId = (tile: Tile) => view.tile(tile)!.id();

    expect(
      "an improvement built in a city's radius sends the city again, with its figures; one out of every radius doesn't",
      [
        emit('tile-improvement:built', oceanSquare),
        emit('tile-improvement:built', world.get(45, 5)),
      ],
      [
        [`tile ${oceanSquare.id()}`, 'city Coastal'],
        [`tile ${world.get(45, 5).id()}`],
      ]
    );

    const rivalUnit = new Warrior(
        null,
        them,
        world.get(31, 30),
        defaultGame.rules
      ),
      standIn = unknownUnitOf(rivalUnit),
      was = standIn._();

    // Upgraded in place, as base-unit-upgrade does it.
    Object.setPrototypeOf(rivalUnit, Musketman.prototype);

    expect(
      "a rival's upgraded unit: its stand-in is its new type, its square goes again, and the unit itself doesn't",
      [was, standIn._(), emit('unit:upgraded', rivalUnit, Warrior, Musketman)],
      ['Warrior', 'Musketman', [`tile ${tileId(rivalUnit.tile())}`]]
    );

    const theirCity = unknownCityOf(theirs),
      theirResearch = defaultGame.playerResearch.getByPlayer(them);

    expect(
      "a rival's advance that doesn't change its cities' era sends nothing",
      emit('player:research-complete', theirResearch),
      []
    );

    theirResearch.addAdvance(Industrialization);

    expect(
      "a rival's advance into a new era: its city's stand-in is drawn in it, and goes again with its square",
      [emit('player:research-complete', theirResearch), theirCity.style()],
      [
        [`update ${theirCity.id()}`, `tile ${tileId(theirs.tile())}`],
        { era: 'industrial', people: 'industrial', larger: false },
      ]
    );

    // Walls (#688, #1069).
    const theirBuild = defaultGame.cityBuilds.getByCity(theirs),
      walled = () =>
        [inland, coastal, theirs].map((city) => additional(city, 'walled'));

    expect('to begin with, no city is walled', walled(), [false, false, false]);
    expect(
      "a rival's building that isn't walls sends nothing",
      [emit('city:building-complete', theirBuild, null), theirCity.walled()],
      [[], false]
    );

    defaultGame.cityImprovements.register(
      new CityWalls(inland, defaultGame.rules)
    );

    expect('City Walls: that city alone is walled', walled(), [
      true,
      false,
      false,
    ]);

    defaultGame.wonders.register(new GreatWall(coastal, defaultGame.rules));

    expect(
      "the Great Wall: walls in every one of its owner's cities, not a rival's",
      [walled(), workerRules().walled!(coastal), workerRules().walled!(theirs)],
      [[true, true, false], true, false]
    );

    const theirWalls = new CityWalls(theirs, defaultGame.rules);

    defaultGame.cityImprovements.register(theirWalls);

    expect(
      "a rival's City Walls: its stand-in is walled, and goes again with its square",
      [
        emit('city:building-complete', theirBuild, null),
        theirCity.keys().includes('walled'),
        theirCity.walled(),
      ],
      [
        [`update ${theirCity.id()}`, `tile ${tileId(theirs.tile())}`],
        true,
        true,
      ]
    );
    expect(
      "a Wonder that changes none of a rival's walls sends nothing",
      emit('wonder:built', null, theirs),
      []
    );

    // A rival's Great Wall reaches its other city, and leaves it once it's obsolete (anyone's Metallurgy).
    const second = addCity(them, world.get(36, 30), 'Second'),
      secondStandIn = unknownCityOf(second),
      greatWall = new GreatWall(theirs, defaultGame.rules);

    defaultGame.wonders.register(greatWall);

    expect(
      "a rival's Great Wall: its other city's stand-in is walled, and goes again with its square",
      [emit('wonder:built', greatWall, theirs), secondStandIn.walled()],
      [[`update ${secondStandIn.id()}`, `tile ${tileId(second.tile())}`], true]
    );

    theirResearch.addAdvance(Metallurgy);

    expect(
      'obsolete: that city is no longer walled, the one with City Walls still is',
      [
        emit('wonder:obsolete', greatWall, theirs),
        secondStandIn.walled(),
        theirCity.walled(),
      ],
      [
        [`update ${secondStandIn.id()}`, `tile ${tileId(second.tile())}`],
        false,
        true,
      ]
    );
    expect(
      'our own Wonder made obsolete sends our cities in full, now',
      emit('wonder:obsolete', null, coastal),
      ['cities']
    );

    // A capture, a city lost, a civil war, a building sabotaged or lost for want of gold: the stand-ins are read when the
    //  patch is built, after the rules that run once the event is raised (a capture's buildings and Wonders go in
    //  `Captured` rules of their own). Walls built or lost in between are sent: read when the event is raised, they
    //  would be read as they were, and go nowhere.
    // Made walls are registered as they're made (the rules' `Created`), so each case first sets them as its stand-in
    //  was last drawn.
    const secondWalls = new CityWalls(second, defaultGame.rules),
      setWalls = (city: City, walls: CityWalls, on: boolean): void => {
        const has = defaultGame.cityImprovements
          .getByCity(city)
          .includes(walls);

        if (on && !has) {
          defaultGame.cityImprovements.register(walls);
        }

        if (!on && has) {
          defaultGame.cityImprovements.unregister(walls);
        }
      };

    (
      [
        ['city:captured', second, [theirs, us, them]],
        ['city:destroyed', second, [theirs, us]],
        ['player:civil-war', second, [them, them, []]],
        ['city:sabotaged', theirs, [theirs, us, theirWalls]],
        ['city:unsupported-improvement', theirs, [theirs, theirWalls]],
      ] as [string, City, unknown[]][]
    ).forEach(([event, changed, args]) => {
      const standIn = unknownCityOf(changed),
        walls = changed === theirs ? theirWalls : secondWalls,
        was = standIn.walled()!;

      setWalls(changed, walls, was);

      expect(
        `${event}: walls changed after it's raised, before it's sent, are sent`,
        [
          emitThen(
            () => setWalls(changed, walls, !was),
            event,
            ...args
          ).includes(`update ${standIn.id()}`),
          standIn.walled(),
        ],
        [true, !was]
      );
    });

    // Ours sabotaged in a rival's turn goes in full, now.
    expect(
      'our own city sabotaged goes again',
      emit('city:sabotaged', inland, them, null),
      ['city Inland']
    );
  }

  // Taken off Auto, it forgets its mode, so a later Auto doesn't take it up again.
  workerRules().autoBuild(build, defaultGame.rules, 'units');
  build.setAuto(false);
  workerRules().autoBuildStopped!(build);

  expect(
    'off Auto: no mode, and none kept',
    [
      additional(build, 'autoMode'),
      defaultGame.pendingEffects
        .getByTarget(inland)
        .some((effect: any) => effect.handler() === 'civ2-city:auto-mode'),
    ],
    [null, false]
  );

  finished = true;

  if (failures.length) {
    process.stderr.write(
      `FAIL civ2Cities (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS civ2Cities (${checks} checks)\n`);
  process.exit(0);
};

run().catch((error) => {
  process.stderr.write(`FAIL civ2Cities: ${error?.stack ?? error}\n`);
  process.exit(1);
});
