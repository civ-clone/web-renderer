// A city stops building what it can no longer build when that happens, not at its player's next discovery (#965).
//  With the plugins the game is built with and the rule sets as they start (bar those below), through a human
//  `DataTransferClient`, checking the game and the build the page holds, which it keeps with its own
//  `applyDataPatches`. On our first turn:
//  - a Bank under way is dropped when its city's Marketplace is sold through the page's sell action, and the page is
//    sent at once the build with nothing chosen and why (`cleared`: `unavailable`, the Bank);
//  - a build kept from a captured city ("A city you capture stops building what it was" unticked, from the first turn)
//    survives the advance we take with the city (we take Pottery, not the Bronze Working it would take to build it),
//    another player's and its previous owner's discovery of the advance that makes it obsolete, and our own unrelated
//    discovery;
//  - a Nuclear unit under way survives the destruction of the Manhattan Project's city (#971).
// As the second turn starts, as in play:
//  - our Hoover Dam is completed: a Power Plant under way on its continent is dropped and one on another continent is
//    not, and the Can't build window's reasons for the two cities say the same;
//  - we discover Gunpowder, and the captured city's kept Spearmen are dropped.
//  The page holds these from the turn's hand-over, which sends our cities whole: nothing tells it of a build dropped
//  in the middle of a turn by anything but an action or a capture, as the engine raises no event for it.
// With `--unticked` (`test:obsolete-builds:unticked`), "A city stops building what it can no longer build" is also
//  unticked from the first turn, and none of them is dropped. The Hoover Dam is completed only once a game, so each
//  has a game of its own.
//
// The Hoover Dam checks are the only guard here that civ1-wonder and civ1-enhanced were taken together: civ1-enhanced's
//  rule drops a plant only through the `excludedBy` entries civ1-wonder 0.1.11 adds, so with an older civ1-wonder the
//  plant would be kept, and nothing else would notice.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';
import './lib/spawnedClients';

import {
  Bank,
  Factory,
  Marketplace,
  PowerPlant,
} from '@civ-clone/civ1-city-improvement/CityImprovements';
import {
  Banking,
  BronzeWorking,
  Currency,
  Electronics,
  Gunpowder,
  Industrialization,
  Pottery,
  Refining,
  Rocketry,
  Writing,
} from '@civ-clone/civ1-science/Advances';
import {
  CAPTURED_CITY_BUILD,
  OBSOLETE_BUILDS,
} from '@civ-clone/civ1-enhanced/RuleSets';
import { HooverDam, ManhattanProject } from '@civ-clone/civ1-wonder/Wonders';
import { Nuclear, Settlers, Spearman } from '@civ-clone/civ1-unit/Units';
import Advance from '@civ-clone/core-science/Advance';
import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import City from '@civ-clone/core-city/City';
import DataObject from '@civ-clone/core-data-object/DataObject';
import DataTransferClient from '@civ-clone/ui-worker-client/DataTransferClient';
import { Gold } from '@civ-clone/civ1-treasury/Yields';
import { HOOVER_DAM_PLANT_RULE_PREFIX } from '@civ-clone/civ1-wonder/RuleIds';
import { ObjectMap } from '@civ-clone/core-data-object/DataObject';
import Player from '@civ-clone/core-player/Player';
import { Production } from '@civ-clone/civ1-world/Yields';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import Tile from '@civ-clone/core-world/Tile';
import applyDataPatches from '@civ-clone/ui-client/lib/applyDataPatches';
import { applyRuleSets } from '@civ-clone/ui-worker-client/lib/ruleSets';
import { defaultGame } from '@civ-clone/core-game/defaultGame';
import { unavailableBuildItems } from '@civ-clone/ui-worker-client/lib/civilopedia';
import { instance as cityBuildRegistryInstance } from '@civ-clone/core-city-build/CityBuildRegistry';
import { instance as cityGrowthRegistryInstance } from '@civ-clone/core-city-growth/CityGrowthRegistry';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as playerResearchRegistryInstance } from '@civ-clone/core-science/PlayerResearchRegistry';
import { instance as playerTreasuryRegistryInstance } from '@civ-clone/core-treasury/PlayerTreasuryRegistry';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';
import { instance as wonderRegistryInstance } from '@civ-clone/core-wonder/WonderRegistry';

const unticked = process.argv.includes('--unticked'),
  // Whether this run's builds are dropped as things happen.
  drops = !unticked,
  name = unticked ? 'obsoleteBuilds --unticked' : 'obsoleteBuilds',
  players = Math.max(config.players, 3);

let finished = false,
  checks = 0,
  humanPlayer: Player | null = null,
  humanClient: DataTransferClient | null = null,
  helper: SimpleAIClient | null = null,
  actionHandler: ((action: any) => unknown) | null = null,
  // The advance we take from the city we capture, as a player would choose it.
  stealing: typeof Advance | null = null,
  pendingChoice: ((value: any) => void) | null = null;

const failures: string[] = [];

// The map the page holds, as `GameState` keeps it.
const objectMap: ObjectMap = { hierarchy: {}, objects: {} };

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

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 50));

// The UI can't ask for a flush, but the engine sends whatever is queued at the end of every action and turn.
const flush = async (): Promise<void> => {
  humanClient!.flush();

  await settle();
};

const held = (id: string | undefined): any =>
  id === undefined ? undefined : objectMap.objects[id];

const ref = (value: any): string | undefined => value?.['#ref'] ?? value?.id;

// What a build's item is, as the game has it and as the page holds it: the item's name, or `null` for nothing.
const building = (city: City): string | null =>
  cityBuildRegistryInstance.getByCity(city).building()?.item().name ?? null;

const itemName = (item: any): string | null =>
  item === undefined || item === null ? null : held(ref(item))?._ ?? item._;

const heldBuild = (city: City): any => held(ref(held(city.id())?.build));

// The build as the page holds it: what it is building, and why it stopped building what it was, if it did.
const onThePage = (city: City) => {
  const build = heldBuild(city);

  return build === undefined
    ? null
    : {
        building: itemName(held(ref(build.building))?.item),
        cleared:
          build.cleared === null || build.cleared === undefined
            ? null
            : {
                reason: build.cleared.reason,
                item: itemName(build.cleared.item),
              },
      };
};

// What the game and the page say a city is building, once it was building `Item`, and either still is or was stopped
//  because it could no longer build it.
const keptOrDropped = (Item: { name: string }, dropped: boolean) => ({
  game: dropped ? null : Item.name,
  page: dropped
    ? {
        building: null,
        cleared: { reason: 'unavailable', item: Item.name },
      }
    : { building: Item.name, cleared: null },
});

const state = (city: City) => ({
  game: building(city),
  page: onThePage(city),
});

const landMassOf = (tile: Tile): unknown =>
  defaultGame.landMasses.getByTile(tile);

// A square of land at least four from every city, for another one, on the same continent as `near` or not.
const site = (near: Tile, sameContinent: boolean = true): Tile => {
  const tile = near
    .map()
    .entries()
    .find(
      (tile) =>
        tile.isLand() &&
        (landMassOf(tile) === landMassOf(near)) === sameContinent &&
        cityRegistryInstance
          .entries()
          .every((city) => city.tile().distanceFrom(tile) >= 4)
    );

  if (!tile) {
    fail(
      `there is no room for another city ${
        sameContinent ? 'on' : 'off'
      } the continent`
    );
  }

  return tile!;
};

const growTo = (city: City, size: number): void => {
  const cityGrowth = cityGrowthRegistryInstance.getByCity(city);

  while (cityGrowth.size() < size) {
    cityGrowth.grow();
  }
};

const discover = async (player: Player, ...advances: (typeof Advance)[]) => {
  const research = playerResearchRegistryInstance.getByPlayer(player);

  advances.forEach((Discovered) => research.addAdvance(Discovered));

  await flush();
};

const knows = (player: Player, Known: typeof Advance): boolean =>
  playerResearchRegistryInstance.getByPlayer(player).completed(Known);

const sell = (city: City, improvementId: string): Promise<void> =>
  Promise.resolve(
    actionHandler!({
      name: 'SellImprovement',
      id: city.id(),
      improvement: improvementId,
      treasury: playerTreasuryRegistryInstance
        .getByPlayerAndType(humanPlayer!, Gold)
        .id(),
    })
  ).then(flush);

// The ids of the rules the Can't build window is given for `Item` in `city`, or `null` while the city can build it.
const refusedBy = (city: City, Item: { name: string }): string[] | null =>
  unavailableBuildItems(cityBuildRegistryInstance.getByCity(city)).find(
    (item) => item.name === Item.name
  )?.refusedBy ?? null;

// The cities each case is played in, kept from the first turn for the second.
let near: City | null = null,
  far: City | null = null,
  theirs: City | null = null,
  silo: City | null = null;

// The first turn: everything is set up, and what happens on our turn's actions is checked: the sale, the capture,
//  other players' discoveries and our unrelated one, and the Manhattan Project's city destroyed. The Hoover Dam is
//  paid for and our research of Gunpowder is complete, so both happen as the next turn starts, as they do in play.
const firstTurn = async (): Promise<void> => {
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

  const [capital] = cityRegistryInstance.getByPlayer(humanPlayer!);

  if (!capital) {
    fail('the starting Settlers could not found a city');
  }

  const [rival, third] = playerRegistryInstance
    .entries()
    .filter((player) => player !== humanPlayer);

  // As the game starts with them: kept captured builds throughout, and in the second run no drops at all.
  applyRuleSets([
    { id: CAPTURED_CITY_BUILD, value: false },
    ...(unticked ? [{ id: OBSOLETE_BUILDS, value: false }] : []),
  ]);

  await discover(
    humanPlayer!,
    Currency,
    Banking,
    Industrialization,
    Refining,
    Electronics,
    Rocketry
  );

  // A Bank under way, and its Marketplace sold.
  const bankCity = new City(humanPlayer!, site(capital!.tile()), 'Bank'),
    marketplace = new Marketplace(bankCity);

  cityBuildRegistryInstance.getByCity(bankCity).build(Bank);
  await flush();

  expect(
    'a Bank is under way in a city with a Marketplace, and the page holds it',
    state(bankCity),
    keptOrDropped(Bank, false)
  );

  await sell(bankCity, marketplace.id());

  expect(
    `selling its Marketplace ${
      drops ? 'drops the Bank, and the page is told why' : 'keeps the Bank'
    }`,
    state(bankCity),
    keptOrDropped(Bank, drops)
  );

  // A Power Plant under way on the Hoover Dam's continent and one off it, and the dam paid for.
  const damCity = new City(humanPlayer!, site(capital!.tile()), 'Dam'),
    damBuild = cityBuildRegistryInstance.getByCity(damCity);

  near = new City(humanPlayer!, site(capital!.tile()), 'Near');
  far = new City(humanPlayer!, site(capital!.tile(), false), 'Far');

  // Each a size that outlasts a turn's famine on whatever square it was given.
  [damCity, near, far].forEach((city) => growTo(city, 3));
  [near, far].forEach((city) => {
    new Factory(city);
    cityBuildRegistryInstance.getByCity(city).build(PowerPlant);
  });
  damBuild.build(HooverDam);
  damBuild.add(new Production(damBuild.cost().value()));
  await flush();

  expect(
    'a Power Plant is under way on the continent and off it',
    [state(near), state(far)],
    [keptOrDropped(PowerPlant, false), keptOrDropped(PowerPlant, false)]
  );

  // A rival's city building Spearmen, which we can't build, captured and kept, taking Pottery with it.
  await discover(rival!, BronzeWorking, Pottery);

  theirs = new City(rival!, site(capital!.tile()), 'Theirs');

  growTo(theirs, 3);
  cityBuildRegistryInstance.getByCity(theirs).build(Spearman);
  stealing = Pottery;
  theirs.capture(humanPlayer!);
  await flush();

  if (
    theirs.destroyed() ||
    !knows(humanPlayer!, Pottery) ||
    knows(humanPlayer!, BronzeWorking) ||
    knows(humanPlayer!, Writing) ||
    knows(humanPlayer!, Gunpowder)
  ) {
    fail(
      `the rest needs the captured city to stand (destroyed: ${theirs.destroyed()}), us to have taken Pottery (${knows(
        humanPlayer!,
        Pottery
      )}), and not to know Bronze Working (${knows(
        humanPlayer!,
        BronzeWorking
      )}), Writing (${knows(humanPlayer!, Writing)}) or Gunpowder (${knows(
        humanPlayer!,
        Gunpowder
      )})`
    );
  }

  expect(
    'a captured city keeps building Spearmen, which we can’t otherwise build, through the advance we take with it',
    [state(theirs), refusedBy(theirs, Spearman) !== null],
    [keptOrDropped(Spearman, false), true]
  );

  await discover(third!, Gunpowder);
  await discover(rival!, Gunpowder);

  expect(
    'and keeps them when another player, then their previous owner, discovers Gunpowder',
    state(theirs),
    keptOrDropped(Spearman, false)
  );

  await discover(humanPlayer!, Writing);

  expect(
    'and when we discover Writing, which still doesn’t let us build them',
    state(theirs),
    keptOrDropped(Spearman, false)
  );

  // Gunpowder, complete as the next turn starts.
  const research = playerResearchRegistryInstance.getByPlayer(humanPlayer!);

  research.research(Gunpowder);
  research.progress().set(research.cost().value());

  // A Nuclear unit under way, and the city with the Manhattan Project destroyed (#971).
  const manhattan = new City(rival!, site(capital!.tile()), 'Manhattan');

  silo = new City(humanPlayer!, site(capital!.tile()), 'Silo');
  growTo(silo, 3);
  wonderRegistryInstance.register(new ManhattanProject(manhattan));
  cityBuildRegistryInstance.getByCity(silo).build(Nuclear);
  await flush();
  manhattan.destroy();
  await flush();

  expect(
    'a Nuclear unit under way is kept when the city with the Manhattan Project is destroyed',
    [manhattan.destroyed(), state(silo)],
    [true, keptOrDropped(Nuclear, false)]
  );
};

// The next turn, as it is handed over: the Hoover Dam completed and Gunpowder discovered as it started.
const secondTurn = (): void => {
  if ([near, far, theirs, silo].some((city) => city!.destroyed())) {
    fail('a city this turn checks was destroyed between the turns');
  }

  expect(
    'the Hoover Dam is completed, and we have discovered Gunpowder, as the turn starts',
    [
      wonderRegistryInstance
        .getByPlayer(humanPlayer!)
        .map((wonder) => wonder.constructor.name),
      knows(humanPlayer!, Gunpowder),
    ],
    [['HooverDam'], true]
  );
  expect(
    `completing it ${
      drops ? 'drops' : 'keeps'
    } the Power Plant on its continent and keeps the one off it, and the page is told as the turn is handed over`,
    [state(near!), state(far!)],
    [keptOrDropped(PowerPlant, drops), keptOrDropped(PowerPlant, false)]
  );
  expect(
    "the Can't build window is given the dam's rule for a Power Plant on its continent, and nothing off it",
    [refusedBy(near!, PowerPlant), refusedBy(far!, PowerPlant)],
    [[`${HOOVER_DAM_PLANT_RULE_PREFIX}/PowerPlant`], null]
  );
  expect(
    `our own discovery of Gunpowder ${
      drops ? 'drops' : 'keeps'
    } the captured city's Spearmen`,
    state(theirs!),
    keptOrDropped(Spearman, drops)
  );
  expect(
    'and the Nuclear unit is still under way',
    state(silo!),
    keptOrDropped(Nuclear, false)
  );
};

let turnsPlayed = 0;

const playTurn = async (): Promise<void> => {
  turnsPlayed++;

  if (turnsPlayed === 1) {
    await firstTurn();

    return;
  }

  secondTurn();
  report();
};

const endTurn = (): Promise<unknown> => {
  // What the turn waits on, done here: a city with nothing to build (the one whose Bank was dropped, say) builds
  //  Settlers, which nothing in this game makes obsolete.
  cityRegistryInstance
    .getByPlayer(humanPlayer!)
    .map((city) => cityBuildRegistryInstance.getByCity(city))
    .filter((cityBuild) => cityBuild.building() === null)
    .forEach((cityBuild) => cityBuild.build(Settlers));

  // And our units, left where they are, with no moves to make.
  unitRegistryInstance
    .getByPlayer(humanPlayer!)
    .forEach((unit) => unit.moves().set(0));

  return Promise.resolve(actionHandler!({ name: 'EndTurn' }));
};

const report = (): void => {
  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL ${name} (${failures.length} of ${checks})\n  ${failures.join(
        '\n  '
      )}\n`
    );
    process.exit(1);
  }

  console.log(
    drops
      ? `PASS ${name} (${checks} checks: a Bank is dropped when its Marketplace is sold, and the page is told; a Power Plant is dropped when its player completes the Hoover Dam on its continent, and kept off it; a build kept from a captured city survives other players' and our unrelated discoveries, and is dropped at our own Gunpowder; a Nuclear unit survives the loss of the Manhattan Project)`
      : `PASS ${name} (${checks} checks: with "A city stops building what it can no longer build" unticked, the Bank, the Power Plant, the captured city's Spearmen and the Nuclear unit are all kept)`
  );

  process.exit(0);
};

const transport = {
  receive: (channel: string, handler: (...args: any[]) => unknown) => {
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

      if (meta.key() === 'capture-city.steal-advance' && stealing !== null) {
        const [choice] = meta
          .choices()
          .filter((choice) => choice.value() === stealing);

        stealing = null;
        setTimeout(() => (pendingChoice ?? respond)!(choice?.id()));

        return;
      }

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

    // Round-tripped, as `postMessage` would.
    if (channel === 'gameData') {
      Object.assign(
        objectMap,
        JSON.parse(
          JSON.stringify(
            data instanceof DataObject ? data.toPlainObject() : data
          )
        )
      );

      return;
    }

    if (channel === 'gameDataPatch') {
      applyDataPatches(objectMap, JSON.parse(JSON.stringify(data)), {
        changed: () => {},
      });

      return;
    }

    if (channel !== 'turnStarted') {
      return;
    }

    setTimeout(() =>
      playTurn()
        .then(() => (finished ? undefined : endTurn()))
        .catch((error) => fail('the turns could not be played', error))
    );
  },
};

engine.on('engine:start', (): void => {
  new Array(players).fill(0).forEach((_, index): void => {
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

engine.setOption('players', players);
engine.setOption('height', config.height);
engine.setOption('width', config.width);

process.on('uncaughtException', (error) => fail('uncaught exception', error));
process.on('unhandledRejection', (error) => fail('unhandled rejection', error));

engine.start();

import('../../src/js/plugins')
  .then(() => engine.emit('plugins:load:end'))
  .catch((error) => fail('failed to load plugins', error));
