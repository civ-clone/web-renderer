// A Wonder lost with its city is never built again, and what it allowed stays allowed (#971). In a seeded game with
//  the plugins the game is built with, on turn 2, in cities made for the purpose:
//  - never built: the Manhattan Project and the Apollo Program are offered, Nuclear units and spaceship parts aren't;
//  - built (the Pyramids, the Colossus, the Manhattan Project and the Apollo Program): each is refused to everyone by
//    `civ1-wonder:city/build/once`, and Nuclear units and parts are offered to players with the advances;
//  - the Colossus's city is captured at size 3: it stands, and is the captor's;
//  - the Manhattan Project's city starves at size 1 and the Apollo Program's is captured at size 1, so both are lost:
//    still refused to every player, for ever, and Nuclear units and parts are still offered.
// The game is then saved, as the worker saves it, with a city part way through building the lost Manhattan Project
//  again, as a game saved before #971 could hold (the `once` rule is switched off while it is chosen, as it then
//  allowed). Loaded in a second process (loading needs an engine that has not started a game), through the
//  renderer's own load path:
//  - all of the above is as it was, and `wonderHistory()` says which Wonders stand, whose they are, and which were
//    lost, a lost one nobody's;
//  - the rebuild, paid for in full, is not completed at its player's turn start: the build is dropped as
//    `unavailable` (what the page says as "{{item}} can no longer be built"), its shields kept, while another city of
//    the same player completes its own paid-for build that same turn start;
//  - a civilization coming into the game after the Apollo Program was lost is given a ship to build parts for.
//
//   node tools/run-suite.js engine lostWonders -- --save <file>
//   node tools/run-suite.js engine lostWonders -- --load <file>
//  (`npm run test:lost-wonders` runs both, `tools/lost-wonders.js`.)

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';
import './lib/spawnedClients';

import {
  ApolloProgram,
  Colossus,
  ManhattanProject,
  Pyramids,
} from '@civ-clone/civ1-wonder/Wonders';
import {
  NuclearFission,
  Rocketry,
  SpaceFlight,
} from '@civ-clone/civ1-science/Advances';
import { Nuclear } from '@civ-clone/civ1-unit/Units';
import { Temple } from '@civ-clone/civ1-city-improvement/CityImprovements';
import Advance from '@civ-clone/core-science/Advance';
import Build from '@civ-clone/core-city-build/Rules/Build';
import City from '@civ-clone/core-city/City';
import FoodExhausted from '@civ-clone/core-city-growth/Rules/FoodExhausted';
import Gold from '@civ-clone/base-city-yield-gold/Gold';
import Player from '@civ-clone/core-player/Player';
import { SaveGame } from '@civ-clone/core-save-game/SaveGame';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import Start from '@civ-clone/core-turn-based-game/Rules/Start';
import { Structural } from '@civ-clone/civ1-spaceship/Parts';
import Tile from '@civ-clone/core-world/Tile';
import TurnStart from '@civ-clone/core-player/Rules/TurnStart';
import { defaultGame as g } from '@civ-clone/core-game/defaultGame';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { plugins } from '../../src/js/plugins';
import { readFileSync, writeFileSync } from 'fs';
import { registerClasses } from '@civ-clone/core-save-game/registerClasses';
import { restoreGame } from '@civ-clone/ui-worker-client/loadGame';
import { save } from '@civ-clone/core-save-game/save';
import { wonderHistory } from '@civ-clone/civ1-wonder/lib/wonderHistory';

const mode = process.argv.includes('--load') ? 'load' : 'save';
const file = process.argv[process.argv.indexOf(`--${mode}`) + 1]!;
const name = `lostWonders${mode === 'load' ? ' (loaded)' : ''}`;

const ONCE = 'civ1-wonder:city/build/once',
  NUCLEAR_NEEDS = 'civ1-wonder:city/build/requires-wonder/Nuclear',
  PART_NEEDS = 'civ1-spaceship:city/build/requires-wonder/Part',
  SHIPS_FOR_NEWCOMERS = 'civ1-spaceship:turn/start/ships-for-newcomers';

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

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `FAIL ${name}: ${reason}\n${
      error instanceof Error ? error.stack : String(error ?? '')
    }\n`
  );
  process.exit(1);

  throw new Error(reason);
};

// A run that stops before it reports has checked nothing (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(`FAIL ${name}: stopped before the checks ran\n`);
    process.exitCode = 1;
  }
});

const report = (summary: string): void => {
  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL ${name} (${failures.length} of ${checks})\n  ${failures.join(
        '\n  '
      )}\n`
    );
    process.exit(1);
  }

  console.log(`PASS ${name} (${checks} checks: ${summary})`);
  process.exit(0);
};

const players = (): Player[] => g.players.entries();

const cityNamed = (cityName: string): City => {
  const city = g.cities.entries().find((city) => city.name() === cityName);

  return city ?? fail(`there is no city called ${cityName}`);
};

// `true` when `city` is offered `Item`, otherwise the ids of the rules that refuse it.
const offered = (city: City, Item: unknown): true | (string | null)[] => {
  const cityBuild = g.cityBuilds.getByCity(city);

  if (cityBuild.available().some((buildItem) => buildItem.item() === Item)) {
    return true;
  }

  return (
    cityBuild.unavailable().find((entry) => entry.item === Item)?.refusedBy ??
    fail(`${(Item as { name: string }).name} is neither offered nor refused`)
  );
};

const refusedOnce = (city: City, Item: unknown): boolean => {
  const result = offered(city, Item);

  return result !== true && result.includes(ONCE);
};

// What every player is offered once the Wonders are built, lost or not: each of the four Wonders refused by `once`
//  to the three of them, Nuclear units and parts offered to the two with the advances.
const afterTheLosses = (when: string): void => {
  const [standing, rival, third] = ['Standing', 'Rival', 'Third'].map(
    cityNamed
  ) as [City, City, City];

  expect(
    `${when}: the Pyramids, the Colossus, the Manhattan Project and the Apollo Program are refused by \`once\` to every player`,
    [standing, rival, third].map((city) =>
      [Pyramids, Colossus, ManhattanProject, ApolloProgram].map((Wonder) =>
        refusedOnce(city, Wonder)
      )
    ),
    [
      [true, true, true, true],
      [true, true, true, true],
      [true, true, true, true],
    ]
  );

  expect(
    `${when}: the lost Manhattan Project and Apollo Program are refused by \`once\` alone to players with the advances`,
    [standing, rival].map((city) => [
      offered(city, ManhattanProject),
      offered(city, ApolloProgram),
    ]),
    [
      [[ONCE], [ONCE]],
      [[ONCE], [ONCE]],
    ]
  );

  expect(
    `${when}: Nuclear units and spaceship parts are still offered to the players with the advances`,
    [standing, rival].map((city) => [
      offered(city, Nuclear),
      offered(city, Structural),
    ]),
    [
      [true, true],
      [true, true],
    ]
  );
};

const wonderHistoryNow = () =>
  wonderHistory(g.wonders, g.cityImprovements).map(
    ({ type, state, city, owner }) => [
      type.name,
      state,
      city?.name() ?? null,
      owner === null ? null : players().indexOf(owner),
    ]
  );

const playSave = (): void => {
  const [first, second, third] = players() as [Player, Player, Player];

  // Every advance for the first two players, so anything can be built; none for the third.
  [first, second].forEach((player: Player): void => {
    const research = g.playerResearch.getByPlayer(player);

    g.advances.entries().forEach((AnAdvance: typeof Advance): void => {
      if (!research.completed(AnAdvance)) {
        research.addAdvance(AnAdvance);
      }
    });
  });

  expect(
    'the first two players have the advances for the Manhattan Project, the Apollo Program, Nuclear units and parts, the third none of them',
    [first, second, third].map((player) =>
      [NuclearFission, Rocketry, SpaceFlight].map((AnAdvance) =>
        g.playerResearch.getByPlayer(player).completed(AnAdvance)
      )
    ),
    [
      [true, true, true],
      [true, true, true],
      [false, false, false],
    ]
  );

  const site = (near: Tile): Tile =>
    near
      .map()
      .entries()
      .find(
        (tile) =>
          tile.isLand() &&
          g.cities
            .entries()
            .every((other: City) => other.tile().distanceFrom(tile) >= 4)
      ) ?? fail('there is no room for another city');

  const [anyUnit] = g.units.entries();
  const near = (
    g.cities.entries()[0] ??
    anyUnit ??
    fail('nothing on the map')
  ).tile();

  const standing = new City(first, site(near), 'Standing'),
    kept = new City(second, site(near), 'Kept'),
    manhattan = new City(second, site(near), 'Manhattan'),
    apollo = new City(second, site(near), 'Apollo'),
    rebuild = new City(first, site(near), 'Rebuild'),
    thirds = new City(third, site(near), 'Third');

  g.cityGrowth.getByCity(kept).grow();
  g.cityGrowth.getByCity(kept).grow();

  expect(
    'never built: the Manhattan Project and the Apollo Program are offered, Nuclear units and parts are not',
    [
      offered(standing, ManhattanProject),
      offered(standing, ApolloProgram),
      offered(standing, Nuclear),
      (offered(standing, Structural) as string[]).includes(PART_NEEDS),
    ],
    [true, true, [NUCLEAR_NEEDS], true]
  );

  expect(
    'never built: the third player is refused the Manhattan Project for want of the advance, not by `once`',
    refusedOnce(thirds, ManhattanProject),
    false
  );

  const complete = (city: City, Item: unknown): boolean => {
    const cityBuild = g.cityBuilds.getByCity(city);

    cityBuild.build(Item as never);
    cityBuild.progress().set(cityBuild.cost().value());

    return cityBuild.check() !== null;
  };

  expect(
    'the four Wonders are completed',
    [
      complete(standing, Pyramids),
      complete(kept, Colossus),
      complete(manhattan, ManhattanProject),
      complete(apollo, ApolloProgram),
      g.wonders.length,
    ],
    [true, true, true, true, 4]
  );

  expect(
    'built: refused by `once` to the players with the advances, and to the third; Nuclear units and parts offered',
    [
      offered(standing, ManhattanProject),
      offered(standing, ApolloProgram),
      offered(kept, Pyramids),
      refusedOnce(thirds, ManhattanProject),
      offered(standing, Nuclear),
      offered(standing, Structural),
    ],
    [[ONCE], [ONCE], [ONCE], true, true, true]
  );

  // The Colossus's city taken at size 3, the Manhattan Project's starved at size 1 through the real `FoodExhausted`
  //  rules, and the Apollo Program's captured at size 1, which civ1-city's capture shrinks to nothing.
  kept.capture(first);
  g.rules.process(FoodExhausted, g.cityGrowth.getByCity(manhattan));
  apollo.capture(first);

  const colossus = g.cityImprovements.getByType(Colossus, true);

  expect(
    "a Wonder's city captured at size 3 stands, with its Wonder, and is the captor's",
    [
      kept.destroyed(),
      g.cityGrowth.getByCity(kept).size(),
      kept.player() === first,
      colossus.length,
      colossus[0]?.destroyed(),
      g.wonders.includes(colossus[0] as never),
    ],
    [false, 2, true, 1, false, true]
  );

  expect(
    "the Manhattan Project's city starved and the Apollo Program's captured at size 1 are gone, with their Wonders",
    [manhattan, apollo].map((city) => {
      const Wonder = city === manhattan ? ManhattanProject : ApolloProgram,
        wonders = g.cityImprovements.getByType(Wonder, true);

      return [
        city.destroyed(),
        wonders.length,
        wonders[0]?.destroyed(),
        g.wonders.entries().some((wonder) => wonder instanceof Wonder),
      ];
    }),
    [
      [true, 1, true, false],
      [true, 1, true, false],
    ]
  );

  // A city of the second player's, made after it lost all three.
  new City(second, site(near), 'Rival');

  afterTheLosses('lost');

  // A city part way through building the lost Manhattan Project again, as a game saved before #971 could hold:
  //  `once` then read only the standing Wonders, so it allowed this.
  const once =
      g.rules.get(Build).find((rule) => rule.id() === ONCE) ??
      fail(`there is no ${ONCE} rule`),
    rebuildBuild = g.cityBuilds.getByCity(rebuild);

  once.disable();
  rebuildBuild.build(ManhattanProject);
  once.enable();
  rebuildBuild.progress().set(50);

  expect(
    'the old-save city is building the lost Manhattan Project again, with 50 shields',
    [
      rebuildBuild.building()?.item() === ManhattanProject,
      rebuildBuild.progress().value(),
    ],
    [true, 50]
  );

  writeFileSync(file, JSON.stringify(save(g, { name: 'lostWonders' })));

  report(
    'never built, offered; built, refused to everyone and Nuclear units and parts offered; a captured city keeps its Wonder; two lost with their cities, refused to everyone and Nuclear units and parts still offered; saved with an old-save rebuild'
  );
};

const playLoad = (): void => {
  const saved = JSON.parse(readFileSync(file, 'utf8')) as SaveGame;

  restoreGame(
    saved,
    (player: Player): SimpleAIClient => new SimpleAIClient(player),
    plugins
  );

  afterTheLosses('loaded');

  expect(
    "loaded: the Wonders ever built, in the original order, standing (where, whose) or lost (where, nobody's)",
    wonderHistoryNow(),
    [
      ['Pyramids', 'standing', 'Standing', 0],
      ['Colossus', 'standing', 'Kept', 0],
      ['ManhattanProject', 'lost', 'Manhattan', null],
      ['ApolloProgram', 'lost', 'Apollo', null],
    ]
  );

  const rebuild = cityNamed('Rebuild'),
    standing = cityNamed('Standing'),
    rebuildBuild = g.cityBuilds.getByCity(rebuild),
    standingBuild = g.cityBuilds.getByCity(standing);

  expect(
    'loaded: the old-save city is still building the lost Manhattan Project, with its 50 shields, and is not on Auto',
    [
      rebuildBuild.building()?.item() === ManhattanProject,
      rebuildBuild.progress().value(),
      rebuildBuild.auto(),
    ],
    [true, 50, false]
  );

  // Paid for in full, then its player's turn starts, as in play: each city's yields are processed. Another city of
  //  the same player's has an ordinary build paid for, which completes in the same turn start. That city is short of
  //  food, with an empty store, and would starve away first, completing nothing (#975): its store is filled for the
  //  turn. And its player has no gold, so the Temple would be sold for its upkeep as soon as it was built: they are
  //  given some.
  const paid = rebuildBuild.cost().value(),
    standingGrowth = g.cityGrowth.getByCity(standing),
    temples = (): number =>
      g.cityImprovements
        .getByCity(standing)
        .filter((improvement) => improvement instanceof Temple).length,
    templesBefore = temples();

  rebuildBuild.progress().set(paid);
  standingBuild.build(Temple);
  standingBuild.progress().set(standingBuild.cost().value());
  standingGrowth.progress().set(Math.floor(standingGrowth.cost().value() / 2));
  g.playerTreasuries.getByPlayerAndType(standing.player(), Gold).add(100);

  g.rules.process(TurnStart, rebuild.player());

  const cleared = rebuildBuild.cleared();

  expect(
    'at the turn start the rebuild is not completed: the build is dropped as `unavailable`, its shields kept, there is still one Manhattan Project, lost, and the city stands',
    [
      rebuildBuild.building(),
      cleared?.reason,
      cleared?.item === ManhattanProject,
      rebuildBuild.progress().value() >= paid,
      g.cityImprovements.getByType(ManhattanProject, true).length,
      g.cityImprovements
        .getByCity(rebuild)
        .some((improvement) => improvement instanceof ManhattanProject),
      g.wonders.entries().some((wonder) => wonder instanceof ManhattanProject),
      rebuild.destroyed(),
    ],
    [null, 'unavailable', true, true, 1, false, false, false]
  );

  expect(
    "the same turn start completes the other city's paid-for Temple, and the city stands",
    [temples() - templesBefore, standing.destroyed()],
    [1, false]
  );

  // A civilization coming into the game now, with the Apollo Program lost (as a destroyed one coming back does, #178).
  const newcomer = new Player(),
    shipsFor = (player: Player): number =>
      g.spaceships.getBy('player', player).length,
    shipsForNewcomers =
      g.rules.get(Start).find((rule) => rule.id() === SHIPS_FOR_NEWCOMERS) ??
      fail(`there is no ${SHIPS_FOR_NEWCOMERS} rule`);

  g.players.register(newcomer);

  const before = shipsFor(newcomer);

  shipsForNewcomers.process(g.turn);

  expect(
    'a civilization coming in after the Apollo Program was lost is given a ship, the others keep theirs',
    [before, shipsFor(newcomer), players().slice(0, 3).map(shipsFor)],
    [0, 1, [1, 1, 1]]
  );

  report(
    'all as saved, wonderHistory standing and lost, the old-save rebuild dropped at the turn start with its shields kept, a newcomer given a ship'
  );
};

process.on('uncaughtException', (error) => fail('uncaught exception', error));
process.on('unhandledRejection', (error) => fail('unhandled rejection', error));

if (mode === 'load') {
  import('../../src/js/plugins')
    .then(playLoad)
    .catch((error) => fail('could not load the game', error));
} else {
  let stopped = false;
  const LOOP = [
    'player:turn-end',
    'player:turn-start',
    'turn:end',
    'turn:start',
  ];
  const emitDirect = engine.emit.bind(engine);

  // The scenario runs as turn 2 starts; nothing after it is played.
  engine.emit = (event: string, ...args: any[]): void => {
    if (stopped && LOOP.includes(event)) {
      return;
    }

    emitDirect(event, ...args);
  };

  engine.on('turn:start', (turn: number): void => {
    if (stopped || turn < 2) {
      return;
    }

    stopped = true;

    try {
      playSave();
    } catch (error) {
      fail('the scenario could not be played', error);
    }
  });

  engine.on('engine:start', (): void => {
    engine.registerPlugins(plugins);
    registerClasses(g);
  });

  engine.on('engine:start', (): void => {
    new Array(Math.max(3, config.players)).fill(0).forEach((): void => {
      const player = new Player();

      g.players.register(player);
      clientRegistryInstance.register(new SimpleAIClient(player));
    });
  });

  engine.setOption('players', Math.max(3, config.players));
  engine.setOption('height', config.height);
  engine.setOption('width', config.width);
  engine.start();

  import('../../src/js/plugins')
    .then(() => engine.emit('plugins:load:end'))
    .catch((error) => fail('failed to load plugins', error));
}
