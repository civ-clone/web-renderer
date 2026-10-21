// What a unit on GoTo does on the way and when it arrives (#357):
//  1. a Bomber sent home past a rival's cities flies around them, lands and refuels;
//  2. a journey blocked part way hands the unit back awake, no longer on GoTo, with its moves;
//  3. a Caravan sent to its city building a Wonder stops next to it, and the UI is told to offer the choice (on the
//     turn it is sent, and when the journey carries on at the start of a turn);
//  4. a unit on GoTo that passes another civilization's unit meets it, as a unit moved there by hand does.
//
// Drives a seeded game with a human `DataTransferClient`, as `tradeRoutes` does. On the human's first turn the starting
// Settlers found a city, and the test places everything each scenario needs on chosen tiles (rival cities and units
// included, so nothing depends on where the seed puts them) and sends `GoTo` the way the unit action menu does. Then
// it ends turns the way the UI does, and checks each scenario as its journey plays out.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';
import './lib/spawnedClients';

import { Bomber, Caravan, Settlers, Warrior } from '@civ-clone/civ1-unit/Units';
import { BronzeWorking } from '@civ-clone/civ1-science/Advances';
import Buildable from '@civ-clone/core-city-build/Buildable';
import BusyGoTo from '@civ-clone/base-unit-action-goto/Busy/GoTo';
import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import City from '@civ-clone/core-city/City';
import { Colossus } from '@civ-clone/civ1-wonder/Wonders';
import DataTransferClient from '../../src/js/Engine/DataTransferClient';
import Negotiation from '@civ-clone/core-diplomacy/Negotiation';
import Player from '@civ-clone/core-player/Player';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import Tile from '@civ-clone/core-world/Tile';
import Unit from '@civ-clone/core-unit/Unit';
import { generateKey } from '@civ-clone/base-unit-action-goto/GoTo';
import { Grassland } from '@civ-clone/civ1-world/Terrains';
import { instance as cityBuildRegistryInstance } from '@civ-clone/core-city-build/CityBuildRegistry';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as interactionRegistryInstance } from '@civ-clone/core-diplomacy/InteractionRegistry';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as playerResearchRegistryInstance } from '@civ-clone/core-science/PlayerResearchRegistry';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { instance as strategyNoteRegistryInstance } from '@civ-clone/core-strategy/StrategyNoteRegistry';
import { instance as turnInstance } from '@civ-clone/core-turn-based-game/Turn';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';

// The human's turns to play after the orders: the Bomber lands at the start of the second, and then has to live
//  through two more turn ends.
const TURNS = 3;

let humanPlayer: Player | null = null,
  humanClient: DataTransferClient | null = null,
  helper: SimpleAIClient | null = null,
  actionHandler: ((action: any) => unknown) | null = null,
  unitActionsHandler: ((unitId: string) => unknown) | null = null,
  pendingChoice: ((value: any) => void) | null = null,
  orderTurn: number | null = null;

// Everything the UI is sent that matters here, in order.
type Sent =
  | { channel: 'turnStarted' }
  | { channel: 'unitHalted'; unit: string; target: string }
  | { channel: 'chooseFromList'; key: string }
  | { channel: 'gameDataPatch'; data: any };

const sent: Sent[] = [],
  results: { name: string; pass: boolean; detail: string }[] = [];

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `FAIL goToArrival: ${reason}\n${
      error instanceof Error ? error.stack : String(error ?? '')
    }\n`
  );
  process.exit(1);

  throw new Error(reason);
};

const check = (name: string, pass: boolean, detail: string): void => {
  results.push({ name, pass, detail });
};

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 50));

const describeTile = (tile: Tile): string => {
  const city = cityRegistryInstance.getByTile(tile);

  return `(${tile.x()},${tile.y()})${city ? `[${city.name()}]` : ''}`;
};

const describe = (unit: Unit): string =>
  `${describeTile(unit.tile())} destroyed=${unit.destroyed()} busy=${
    unit.busy()?.constructor.name ?? 'null'
  } active=${unit.active()} moves=${unit.moves().value()}`;

const playerTileOf = (tile: Tile) => {
  const playerWorld = playerWorldRegistryInstance.getByPlayer(humanPlayer!);

  playerWorld.register(tile);

  const playerTile = playerWorld.getByTile(tile);

  if (!playerTile) {
    fail(`the player can't see ${describeTile(tile)}`);
  }

  return playerTile!;
};

const unitAction = (unit: Unit, name: string, target: Tile): Promise<void> =>
  Promise.resolve(
    actionHandler!({
      name: 'ActiveUnit',
      id: unit.id(),
      unitAction: name,
      target: playerTileOf(target).id(),
    })
  ).then(settle);

// The tile `dx`, `dy` from `tile`, wrapping east-west and kept off the poles.
const offset = (tile: Tile, dx: number, dy: number): Tile => {
  const world = tile.map(),
    width = world.width(),
    height = world.height(),
    y = tile.y() + dy,
    safeY = y < 1 || y > height - 2 ? tile.y() - dy : y;

  return world.get((((tile.x() + dx) % width) + width) % width, safeY);
};

const negotiated = (rival: Player): boolean =>
  interactionRegistryInstance
    .getByPlayer(rival)
    .some(
      (interaction) =>
        interaction instanceof Negotiation &&
        interaction.isBetween(rival, humanPlayer!)
    );

// The tiles the UI has been sent `unit`'s `name` actions for, since `from`: from the unit's `actionsForNeighbours`, as
//  the arrow keys and `HaltedUnits` read them.
const actionTargetsSent = (
  unit: Unit,
  name: string,
  from: number
): string[] => {
  const targets: string[] = [],
    ref = (value: any): string | null => value?.['#ref'] ?? value?.id ?? null;

  sent.slice(from).forEach((entry) => {
    if (entry.channel !== 'gameDataPatch') {
      return;
    }

    entry.data.forEach((patch: any) =>
      Object.values(patch).forEach(({ value }: any) => {
        const objects = value?.objects ?? {},
          sentUnit = objects[unit.id()];

        Object.values(sentUnit?.actionsForNeighbours ?? {}).forEach(
          (actions: any) =>
            actions.forEach((action: any) => {
              const resolved = objects[ref(action) ?? ''] ?? action;

              if (resolved?._ === name) {
                targets.push(ref(resolved.to) ?? '');
              }
            })
        );
      })
    );
  });

  return targets;
};

const haltsSince = (from: number, unit: Unit) =>
  sent
    .map((entry, index) => ({ entry, index }))
    .filter(
      ({ entry, index }) =>
        index >= from &&
        entry.channel === 'unitHalted' &&
        entry.unit === unit.id()
    );

// The UI asks for a halted unit's actions when it makes it active, as `HaltedUnits` and `UnitActionsRequest` do.
const askForActions = async (unit: Unit): Promise<void> => {
  unitActionsHandler!(unit.id());

  await settle();
};

type Scenarios = {
  home: City;
  bomber: Bomber;
  blocked: Bomber;
  blockedNext: Tile | null;
  caravanNow: Caravan;
  caravanNowFrom: number;
  caravanLater: Caravan;
  caravanLaterFrom: number;
};

let scenarios: Scenarios | null = null;

const order = async (): Promise<void> => {
  const [founder] = unitRegistryInstance
    .getByPlayer(humanPlayer!)
    .filter((unit) => unit instanceof Settlers);

  if (!founder) {
    fail('the human player has no Settlers to start with');
  }

  await unitAction(founder, 'FoundCity', founder.tile());

  const [home] = cityRegistryInstance.getByPlayer(humanPlayer!);

  if (!home) {
    fail('the starting Settlers could not found a city');
  }

  const homeTile = home.tile(),
    rivals = playerRegistryInstance
      .entries()
      .filter((player) => player !== humanPlayer);

  if (rivals.length < 3) {
    fail(`three rivals are needed, there are ${rivals.length}`);
  }

  // 1. A Bomber 10 tiles west of home (8 moves, 2 turns aloft), with three of a rival's cities across the straight
  //  line half way, each held by a Warrior (an aircraft can fly over an empty one).
  const bomberStart = offset(homeTile, -10, 0);

  [-1, 0, 1].forEach((dy) => {
    const tile = offset(homeTile, -5, dy);

    new City(rivals[0], tile, `Wall ${dy}`);
    new Warrior(null, rivals[0], tile);
  });

  const bomber = new Bomber(null, humanPlayer!, bomberStart);

  playerTileOf(bomberStart);

  // 2. A Bomber 12 tiles from one of its own cities, so it is still on its way at the end of the turn.
  const blockedStart = offset(homeTile, 14, 4),
    faraway = new City(humanPlayer!, offset(blockedStart, 12, 0), 'Faraway'),
    blocked = new Bomber(null, humanPlayer!, blockedStart);

  playerTileOf(blockedStart);

  // 3. Caravans heading for the city as it builds a Wonder: one with the moves to get there this turn, one that gets
  //  next to it at the start of the next.
  playerResearchRegistryInstance
    .getByPlayer(humanPlayer!)
    .addAdvance(BronzeWorking);
  cityBuildRegistryInstance
    .getByCity(home)
    .build(Colossus as unknown as typeof Buildable);

  // With a land step between it and the city, so a land unit can get there (a tile across water has no route).
  const landTwoAway = homeTile
    .getSurroundingArea(2)
    .entries()
    .filter(
      (tile) =>
        tile.isLand() &&
        tile !== homeTile &&
        !tile.isNeighbourOf(homeTile) &&
        tile
          .getNeighbours()
          .some(
            (neighbour) =>
              neighbour.isLand() && neighbour.isNeighbourOf(homeTile)
          ) &&
        cityRegistryInstance.getByTile(tile) === null &&
        unitRegistryInstance.getByTile(tile).length === 0
    );

  if (landTwoAway.length < 2) {
    fail('two land tiles two from the city are needed for the Caravans');
  }

  const [nowStart, laterStart] = landTwoAway,
    caravanNow = new Caravan(home, humanPlayer!, nowStart),
    caravanLater = new Caravan(home, humanPlayer!, laterStart);

  playerTileOf(nowStart);
  playerTileOf(laterStart);

  // 4. First contact, far from everything else. A rival's Warriors stand either side of the first step, so a route
  //  of six steps east has to pass between them, and ends out of their reach.
  const contactStart = offset(homeTile, 25, 0),
    contactEnd = offset(contactStart, 6, 0),
    manualStart = offset(contactStart, 0, 8),
    goToRival = rivals[1],
    manualRival = rivals[2];

  [1, -1].forEach((dy) => {
    new Warrior(null, goToRival, offset(contactStart, 1, dy));
    new Warrior(null, manualRival, offset(manualStart, 1, dy));
  });

  const goToBomber = new Bomber(null, humanPlayer!, contactStart),
    manualBomber = new Bomber(null, humanPlayer!, manualStart);

  playerTileOf(contactStart);
  playerTileOf(manualStart);

  await settle();
  humanClient!.flush();

  // 1.
  await unitAction(bomber, 'GoTo', homeTile);

  // 2. Once on its way, a rival city goes up on the next tile of its route.
  await unitAction(blocked, 'GoTo', faraway.tile());

  const [blockedNext] =
    strategyNoteRegistryInstance
      .getByKey<Tile[]>(generateKey(blocked))
      ?.value() ?? [];

  if (!blockedNext) {
    fail(`the blocked Bomber's journey is already over: ${describe(blocked)}`);
  }

  // On Grassland, so it can't starve before the check: a size-1 city on Mountains or Swamp is gone by the next turn, and
  //  the Bomber would fly on to Faraway.
  blockedNext!.setTerrain(new Grassland());
  new City(rivals[0], blockedNext!, 'Roadblock');
  new Warrior(null, rivals[0], blockedNext!);

  // 3.
  // Moves to spare, whatever the terrain on the way.
  caravanNow.moves().set(10);

  const caravanNowFrom = sent.length;

  await unitAction(caravanNow, 'GoTo', homeTile);

  const caravanLaterFrom = sent.length;

  await unitAction(caravanLater, 'GoTo', homeTile);

  // Wherever its move today took it, it ends the turn next to the city with only the city left to go, so the
  //  journey's last step comes at the start of the next turn whatever the terrain.
  const [besideHome] = homeTile
      .getNeighbours()
      .filter(
        (tile) =>
          tile.isLand() &&
          cityRegistryInstance.getByTile(tile) === null &&
          unitRegistryInstance.getByTile(tile).length === 0
      ),
    laterPath = strategyNoteRegistryInstance
      .getByKey<Tile[]>(generateKey(caravanLater))
      ?.value();

  if (!besideHome || !laterPath) {
    fail(
      `the second Caravan can't be set up next to the city: ${describe(
        caravanLater
      )}`
    );
  }

  caravanLater.setTile(besideHome);
  laterPath!.splice(0, laterPath!.length, homeTile);

  checkCaravanNow(home, caravanNow, caravanNowFrom);
  await checkCaravanActions(
    '3. Caravan halted this turn',
    home,
    caravanNow,
    caravanNowFrom
  );

  // 4.
  if (negotiated(goToRival) || negotiated(manualRival)) {
    fail('the contact rivals have already been met');
  }

  await unitAction(goToBomber, 'GoTo', contactEnd);

  check(
    '4. First contact on GoTo',
    negotiated(goToRival),
    `Bomber ${describeTile(contactStart)} -> ${describe(
      goToBomber
    )}; negotiation started: ${negotiated(goToRival)}`
  );

  for (let step = 1; step <= 6; step++) {
    await unitAction(manualBomber, 'Move', offset(manualStart, step, 0));
  }

  check(
    '4. First contact moved by hand (control)',
    negotiated(manualRival),
    `Bomber ${describeTile(manualStart)} -> ${describe(
      manualBomber
    )}; negotiation started: ${negotiated(manualRival)}`
  );

  // Out of the way: they'd crash at the end of the turn either way.
  goToBomber.destroy();
  manualBomber.destroy();

  scenarios = {
    home,
    bomber,
    blocked,
    blockedNext: blockedNext!,
    caravanNow,
    caravanNowFrom,
    caravanLater,
    caravanLaterFrom,
  };
};

const checkCaravanNow = (home: City, caravan: Caravan, from: number): void => {
  const halts = haltsSince(from, caravan),
    target = playerTileOf(home.tile()).id();

  check(
    '3. Caravan stops next to its Wonder city',
    caravan.tile().isNeighbourOf(home.tile()) && !caravan.busy(),
    describe(caravan)
  );
  check(
    '3. The UI is told the Caravan halted, this turn',
    halts.length === 1 && (halts[0].entry as any).target === target,
    JSON.stringify(halts.map(({ entry }) => entry))
  );
};

const checkCaravanActions = async (
  name: string,
  home: City,
  caravan: Caravan,
  from: number
): Promise<void> => {
  const engineSide = caravan
    .actions(home.tile())
    .map((action) => action.sourceClass().name);

  await askForActions(caravan);

  const target = playerTileOf(home.tile()).id(),
    sentTargets = actionTargetsSent(caravan, 'HelpBuildWonder', from);

  check(
    `${name}: the UI gets Help build Wonder for the city`,
    engineSide.includes('HelpBuildWonder') && sentTargets.includes(target),
    `engine offers ${JSON.stringify(
      engineSide
    )}; UI sent HelpBuildWonder to ${JSON.stringify(
      sentTargets
    )}, city tile ${target}`
  );
};

const checkTurnStart = async (turn: number): Promise<void> => {
  const { home, bomber, blocked, blockedNext, caravanLater, caravanLaterFrom } =
    scenarios!;

  if (turn === 2) {
    // 2.
    check(
      '2. A journey blocked part way hands the unit back',
      !blocked.destroyed() &&
        blocked.active() &&
        !(blocked.busy() instanceof BusyGoTo) &&
        blocked.moves().value() === blocked.movement().value() &&
        blocked.tile().isNeighbourOf(blockedNext!),
      `${describe(blocked)}; blocked at ${describeTile(blockedNext!)}`
    );

    // Out of the way: it would crash at the end of the turn.
    blocked.destroy();

    // 3. At the start of the turn.
    const halts = haltsSince(caravanLaterFrom, caravanLater),
      turnStarted = sent.findIndex(
        (entry, index) =>
          index >= caravanLaterFrom && entry.channel === 'turnStarted'
      ),
      target = playerTileOf(home.tile()).id();

    check(
      '3. Caravan stops next to its Wonder city at the start of a turn',
      caravanLater.tile().isNeighbourOf(home.tile()) && !caravanLater.busy(),
      describe(caravanLater)
    );
    check(
      '3. The UI is told after the turn starts',
      halts.length === 1 &&
        (halts[0].entry as any).target === target &&
        turnStarted !== -1 &&
        halts[0].index > turnStarted,
      `turnStarted at ${turnStarted}; halts ${JSON.stringify(halts)}`
    );

    await checkCaravanActions(
      '3. Caravan halted at the start of a turn',
      home,
      caravanLater,
      caravanLaterFrom
    );
  }

  if (turn === TURNS) {
    // 1.
    check(
      '1. Bomber flies home around a rival city and survives',
      !bomber.destroyed() && bomber.tile() === home.tile(),
      describe(bomber)
    );

    evaluate();
  }
};

const evaluate = (): void => {
  results.forEach(({ name, pass, detail }) =>
    console.log(
      `${pass ? 'PASS' : 'FAIL'} goToArrival: ${name}${
        pass ? '' : `\n    ${detail}`
      }`
    )
  );

  process.exit(results.every(({ pass }) => pass) ? 0 : 1);
};

const playTurn = async (): Promise<void> => {
  if (orderTurn === null) {
    orderTurn = turnInstance.value();

    await order();

    return;
  }

  await checkTurnStart(turnInstance.value() - orderTurn + 1);
};

// The rest of the turn is played by a `SimpleAIClient` for the same player, as in `standingOrders`. The scenario units
//  are put aside first, so it doesn't fly a landed aircraft off again. A unit on GoTo needn't be active to carry on.
const endTurn = (): Promise<unknown> =>
  settle()
    .then(() => {
      const { bomber, blocked, caravanNow, caravanLater } = scenarios!;

      [bomber, blocked, caravanNow, caravanLater].forEach((unit) => {
        if (!unit.destroyed()) {
          unit.setActive(false);
        }
      });
    })
    .then(() => helper!.takeTurn())
    .then(() => actionHandler!({ name: 'EndTurn' }));

const transport = {
  receive: (channel: string, handler: (...args: any[]) => unknown) => {
    if (channel === 'action') {
      actionHandler = handler;
    }

    if (channel === 'unitActions') {
      unitActionsHandler = handler;
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
    if (channel === 'gameDataPatch') {
      // Round-trip, as `postMessage` would.
      sent.push({ channel, data: JSON.parse(JSON.stringify(data)) });

      return;
    }

    if (channel === 'unitHalted') {
      sent.push({ channel, unit: data.unit, target: data.target });

      return;
    }

    if (channel === 'chooseFromList') {
      const meta = data as ChoiceMeta<any>,
        respond = pendingChoice;

      sent.push({ channel, key: String(meta.key?.() ?? '?') });

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

    if (channel !== 'turnStarted') {
      return;
    }

    sent.push({ channel });

    setTimeout(() =>
      playTurn()
        .then(endTurn)
        .catch((error) => fail('the turn could not be played', error))
    );
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
