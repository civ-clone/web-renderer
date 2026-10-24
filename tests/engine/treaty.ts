// A treaty partner's land (#287) and the Senate (#133), through what the UI is sent and sends.
//
// Drives a seeded game with a human `DataTransferClient`, as `diplomats` does. On the human's first turn the test
// founds a city, puts a computer player's city a few tiles away working an irrigated square, signs peace with it, and
// puts a Warrior next to that square. Then, as the arrow keys would read and send them:
//  1. the unit's actions onto the square are Break treaty (`SneakMove`) and Cancel (`AbortMove`), each naming the
//     partner, and Cancel leaves the Warrior where it was with its move spent and the treaty kept;
//  2. under Democracy they are `Overruled`, which carries the `SneakMove` it stands for, and `AbortMove`; choosing
//     `Overruled` spends the move and keeps the treaty;
//  3. back under Despotism, Break treaty moves the Warrior and ends the treaty.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';
import './lib/spawnedClients';

import { Democracy, Despotism } from '@civ-clone/civ1-government/Governments';
import { Settlers, Warrior } from '@civ-clone/civ1-unit/Units';
import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import City from '@civ-clone/core-city/City';
import DataTransferClient from '../../src/js/Engine/DataTransferClient';
import { Irrigation } from '@civ-clone/civ1-world/TileImprovements';
import { Peace } from '@civ-clone/library-diplomacy/Declarations';
import Player from '@civ-clone/core-player/Player';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import Tile from '@civ-clone/core-world/Tile';
import Unit from '@civ-clone/core-unit/Unit';
import WorkedTile from '@civ-clone/core-city/WorkedTile';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as interactionRegistryInstance } from '@civ-clone/core-diplomacy/InteractionRegistry';
import { instance as playerGovernmentRegistryInstance } from '@civ-clone/core-government/PlayerGovernmentRegistry';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { instance as tileImprovementRegistryInstance } from '@civ-clone/core-tile-improvement/TileImprovementRegistry';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';
import { reconstituteData } from '../../src/js/UI/lib/reconstituteData';
import { unknownPlayerOf } from '../../src/js/Engine/Client/standIns';
import { instance as workedTileRegistryInstance } from '@civ-clone/core-city/WorkedTileRegistry';

let started = false,
  humanPlayer: Player | null = null,
  humanClient: DataTransferClient | null = null,
  helper: SimpleAIClient | null = null,
  actionHandler: ((action: any) => unknown) | null = null,
  unitActionsHandler: ((unitId: string) => unknown) | null = null,
  pendingChoice: ((value: any) => void) | null = null;

// Every `gameDataPatch`, round-tripped as `postMessage` would, and the key of every `gameNotification`.
const patches: any[] = [],
  notifications: string[] = [];

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `FAIL treaty: ${reason}\n${
      error instanceof Error ? error.stack : String(error ?? '')
    }\n`
  );
  process.exit(1);

  throw new Error(reason);
};

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 50));

const flush = async (): Promise<void> => {
  await settle();

  // The UI can't ask for a flush, but a real game has long since sent everything by now.
  humanClient!.flush();
};

const ref = (value: any): string | null => value?.['#ref'] ?? value?.id ?? null;

// The actions onto `target` the UI was last sent for `unit`, refs resolved against the patch that carried them, as
//  the arrow keys read `actionsForNeighbours`.
const actionsSent = (unit: Unit, target: Tile): any[] => {
  const targetId = playerWorldRegistryInstance
    .getByPlayer(humanPlayer!)
    .getByTile(target)!
    .id();
  let found: any[] | null = null;

  patches.forEach((data) =>
    data.forEach((patch: any) =>
      Object.values(patch).forEach(({ value }: any) => {
        const objects = value?.objects ?? {},
          resolve = (item: any): any => objects[ref(item) ?? ''] ?? item,
          sentUnit = objects[unit.id()];

        Object.values(sentUnit?.actionsForNeighbours ?? {}).forEach(
          (actions: any) => {
            const resolved = actions.map(resolve);

            if (resolved.some((action: any) => ref(action.to) === targetId)) {
              found = resolved.map((action: any) => ({
                ...action,
                enemy: resolve(action.enemy),
                partner: resolve(action.partner),
                action: action.action
                  ? {
                      ...resolve(action.action),
                      enemy: resolve(resolve(action.action).enemy),
                    }
                  : undefined,
              }));
            }
          }
        );
      })
    )
  );

  if (found === null) {
    fail(`the UI was sent no actions for ${unit.id()} onto ${targetId}`);
  }

  return found!;
};

const askForActions = async (unit: Unit): Promise<void> => {
  unitActionsHandler!(unit.id());

  await settle();
};

const unitAction = (unit: Unit, name: string, target: Tile): Promise<void> => {
  const playerTile = playerWorldRegistryInstance
    .getByPlayer(humanPlayer!)
    .getByTile(target);

  if (!playerTile) {
    fail(`the player has not seen the tile ${unit.id()} is acting on`);
  }

  if (
    !unit.actions(target).some((action) => action.sourceClass().name === name)
  ) {
    fail(`${unit.id()} is not offered ${name}`);
  }

  return Promise.resolve(
    actionHandler!({
      name: 'ActiveUnit',
      id: unit.id(),
      unitAction: name,
      target: playerTile!.id(),
    })
  ).then(settle);
};

const run = async (): Promise<void> => {
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

  // A land tile a few tiles away for the partner's city, with free land around it.
  const partner = playerRegistryInstance
      .entries()
      .find((player) => player !== humanPlayer)!,
    playerWorld = playerWorldRegistryInstance.getByPlayer(humanPlayer!),
    free = (tile: Tile): boolean =>
      tile.isLand() &&
      cityRegistryInstance.getByTile(tile) === null &&
      unitRegistryInstance.getByTile(tile).length === 0,
    [site] = home
      .tile()
      .getSurroundingArea(6)
      .entries()
      .filter(
        (tile) =>
          free(tile) &&
          tile.distanceFrom(home.tile()) >= 4 &&
          tile.getNeighbours().every(free)
      );

  if (!site) {
    fail('no land near the city for a partner city with room around it');
  }

  const city = new City(partner, site, 'Partner'),
    [land] = site.getNeighbours(),
    [beside] = land
      .getNeighbours()
      .filter(
        (tile: Tile) => free(tile) && tile !== site && !tile.isNeighbourOf(site)
      );

  if (!beside) {
    fail('no free land beside the worked square that is not next to the city');
  }

  // The square stays worked whatever the city would rather work: a change of government has it choose again.
  const work = (): void => {
    if (workedTileRegistryInstance.getByTile(land)?.city() !== city) {
      workedTileRegistryInstance.unregisterByTile(land);
      workedTileRegistryInstance.register(new WorkedTile(land, city));
    }
  };

  work();
  tileImprovementRegistryInstance.register(new Irrigation(land));
  interactionRegistryInstance.register(new Peace(humanPlayer!, partner));
  playerWorld.register(site, ...site.getNeighbours(), ...land.getNeighbours());

  const atPeace = (): boolean =>
      interactionRegistryInstance
        .getByPlayers(humanPlayer!, partner)
        .some(
          (interaction) =>
            interaction instanceof Peace && (interaction as Peace).active()
        ),
    warrior = new Warrior(home, humanPlayer!, beside),
    names = (actions: any[]): string[] => actions.map(({ _ }) => _);

  // 1. Break treaty and Cancel; Cancel spends the move.
  warrior.moves().set(1);

  await flush();
  await askForActions(warrior);

  // Another player goes to the UI as the stand-in the player knows it by (#449).
  const offered = actionsSent(warrior, land),
    partnerId = unknownPlayerOf(partner).id();

  if (
    JSON.stringify(names(offered)) !==
      JSON.stringify(['SneakMove', 'AbortMove']) ||
    ref(offered[0].enemy) !== partnerId ||
    ref(offered[1].partner) !== partnerId
  ) {
    fail(
      `onto the partner's land the UI was sent ${JSON.stringify(
        offered.map(({ _, enemy, partner }) => [_, ref(enemy), ref(partner)])
      )}`
    );
  }

  await unitAction(warrior, 'AbortMove', land);

  if (
    warrior.tile() !== beside ||
    warrior.moves().value() !== 0 ||
    !atPeace()
  ) {
    fail(
      `Cancel left the Warrior ${
        warrior.tile() === beside ? 'in place' : 'moved'
      } with ${warrior.moves().value()} moves, ${
        atPeace() ? 'at peace' : 'at war'
      }`
    );
  }

  // 2. Under Democracy, Break treaty is overruled: the UI is sent what it stands for.
  playerGovernmentRegistryInstance
    .getByPlayer(humanPlayer!)
    .set(new Democracy());
  warrior.moves().set(1);
  warrior.setActive(true);
  work();

  await flush();
  await askForActions(warrior);

  const overruled = actionsSent(warrior, land);

  if (
    JSON.stringify(names(overruled)) !==
      JSON.stringify(['Overruled', 'AbortMove']) ||
    overruled[0].action?._ !== 'SneakMove' ||
    ref(overruled[0].action?.enemy) !== partnerId
  ) {
    fail(
      `under Democracy the UI was sent ${JSON.stringify(
        overruled.map(({ _, action }) => [_, action?._, ref(action?.enemy)])
      )}`
    );
  }

  await unitAction(warrior, 'Overruled', land);

  if (
    warrior.tile() !== beside ||
    warrior.moves().value() !== 0 ||
    !atPeace()
  ) {
    fail(
      `Overruled left the Warrior ${
        warrior.tile() === beside ? 'in place' : 'moved'
      } with ${warrior.moves().value()} moves, ${
        atPeace() ? 'at peace' : 'at war'
      }`
    );
  }

  // 3. Free again, Break treaty makes the move and ends the treaty.
  playerGovernmentRegistryInstance
    .getByPlayer(humanPlayer!)
    .set(new Despotism());
  warrior.moves().set(1);
  warrior.setActive(true);
  work();

  await flush();
  const notifiedBefore = notifications.length;

  await unitAction(warrior, 'SneakMove', land);
  await flush();

  if (warrior.tile() !== land || atPeace()) {
    fail(
      `Break treaty left the Warrior ${
        warrior.tile() === land ? 'on' : 'off'
      } the partner's land, ${atPeace() ? 'at peace' : 'at war'}`
    );
  }

  // We broke it, so we're told so, not that we were attacked (#641).
  const told = notifications.slice(notifiedBefore);

  if (
    !told.includes('Player.declaration-broken') ||
    told.includes('Player.declaration-expired')
  ) {
    fail(`breaking the treaty told the player ${JSON.stringify(told)}`);
  }

  console.log(
    `PASS treaty (onto a partner's worked land: Break treaty and Cancel sent with the partner, Cancel spends the move; under Democracy Overruled is sent with the SneakMove it stands for and spends the move; Break treaty moves, ends the treaty and tells the player they broke it)`
  );

  process.exit(0);
};

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
      patches.push(JSON.parse(JSON.stringify(data)));

      return;
    }

    if (channel === 'gameNotification') {
      notifications.push(
        reconstituteData(JSON.parse(JSON.stringify(data))).key
      );

      return;
    }

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

    if (channel === 'turnStarted' && !started) {
      started = true;

      setTimeout(() =>
        run().catch((error) => fail('the treaty could not be played', error))
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
