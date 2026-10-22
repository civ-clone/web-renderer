// A change of government sends the squares whose yields it changed, not every square the player knows (#488).
//
// A government's yields reach every square, so a change of government used to resend every square the player knew,
// twice a revolution (Anarchy, then the new government): on a revealed map, thousands of squares and a patch of
// megabytes each time, which the UI then redrew square by square. Many squares yield the same under the new
// government as under the old, and going into Anarchy from Despotism changes none.
//
// Drives a seeded game with a human `DataTransferClient` over a stub transport that records everything it sends, and
// reveals the map with the cheat the UI sends. What the UI holds of each square is built from that traffic alone: the
// yields last sent for it. Then the human's government changes, one way and another, and each time what the UI holds
// afterwards has to be what the engine says each square yields, and no square whose yields the UI already held may go,
// unless the client could not know them (a square whose yields the engine had forgotten) or something else changed
// the square in the same flush, in which case it goes once.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';
import './lib/spawnedClients';

import {
  Anarchy,
  Despotism,
  Monarchy,
  Republic,
} from '@civ-clone/civ1-government/Governments';
import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import DataTransferClient from '../../src/js/Engine/DataTransferClient';
import Government from '@civ-clone/core-government/Government';
import Player from '@civ-clone/core-player/Player';
import PlayerTile from '@civ-clone/core-player-world/PlayerTile';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerGovernmentRegistryInstance } from '@civ-clone/core-government/PlayerGovernmentRegistry';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';

let started = false,
  finished = false,
  humanPlayer: Player | null = null,
  // Answers the choices the game asks the human for, such as which civilization to be.
  helper: SimpleAIClient | null = null,
  pendingChoice: ((value: any) => void) | null = null,
  client: DataTransferClient | null = null,
  cheat: ((data: any) => void) | null = null,
  patches: any[][] = [];

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `FAIL governmentTiles: ${reason}\n${
      error instanceof Error ? error.stack : String(error ?? '')
    }\n`
  );
  process.exit(1);

  throw new Error(reason);
};

// A run that stops before it reports has checked nothing (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      'FAIL governmentTiles: stopped before the checks ran\n'
    );
    process.exitCode = 1;
  }
});

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const transport = {
  receive: (channel: string, handler: (...args: any[]) => void) => {
    if (channel === 'cheat') {
      cheat = handler;
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

    if (channel === 'gameData' || channel === 'gameDataPatch') {
      // Built when they are sent, so copied as the UI would receive them.
      patches.push(JSON.parse(JSON.stringify(data)));

      return;
    }

    if (channel === 'turnStarted' && !started) {
      started = true;

      setTimeout(() => run().catch((error) => fail('the test threw', error)));
    }
  },
};

// What the engine says a square yields now, each kind with what it is made up of: what the client sends.
const engineYields = (playerTile: PlayerTile): string =>
  JSON.stringify(
    playerTile
      .yields()
      .map((tileYield) => [tileYield.constructor.name, tileYield.values()])
  );

// Every `ObjectMap` in a message, however deep.
const objectMaps = (value: any, found: any[] = []): any[] => {
  if (value === null || typeof value !== 'object') {
    return found;
  }

  if ('hierarchy' in value && 'objects' in value) {
    found.push(value);

    return found;
  }

  Object.values(value).forEach((child) => objectMaps(child, found));

  return found;
};

// What the UI holds of each square's yields, by id: the yields last sent for it.
const held = new Map<string, string>();

// Takes in what was sent, and says how many times each square was sent in it.
const receive = (data: any): Map<string, number> => {
  const counts = new Map<string, number>();

  objectMaps(data).forEach(({ objects }) =>
    Object.values(objects).forEach((object: any) => {
      if (object?._ !== 'PlayerTile' || !Array.isArray(object.yields)) {
        return;
      }

      held.set(
        object.id,
        JSON.stringify(
          object.yields.map((tileYield: any) => {
            const resolved = objects[tileYield['#ref']] ?? tileYield;

            return [resolved._, resolved.values];
          })
        )
      );

      counts.set(object.id, (counts.get(object.id) ?? 0) + 1);
    })
  );

  return counts;
};

const results: string[] = [];

const tiles = (): PlayerTile[] =>
  playerWorldRegistryInstance.getByPlayer(humanPlayer!).entries();

const setGovernment = (government: Government): void =>
  playerGovernmentRegistryInstance.getByPlayer(humanPlayer!).set(government);

/**
 * Runs `act`, which changes the government and whatever else, then flushes once, as the client does after an action,
 *  and checks what went. `alsoSent` gives the squares that have to go whatever their yields: forgotten ones, or ones
 *  something else changed in the same flush. Gives the squares whose yields changed.
 */
const change = (
  label: string,
  act: () => void,
  alsoSent: () => Set<PlayerTile> = () => new Set()
): PlayerTile[] => {
  const before = new Map(
      tiles().map((playerTile) => [playerTile, held.get(playerTile.id())])
    ),
    extra = alsoSent();

  patches = [];

  const start = performance.now();

  act();
  client!.flush();

  const took = performance.now() - start,
    bytes = JSON.stringify(patches).length,
    counts = receive(patches),
    known = tiles(),
    changed = known.filter(
      (playerTile) => before.get(playerTile) !== engineYields(playerTile)
    );

  known.forEach((playerTile) => {
    const where = `${label}: ${playerTile.x()},${playerTile.y()}`,
      now = engineYields(playerTile),
      count = counts.get(playerTile.id()) ?? 0;

    if (held.get(playerTile.id()) !== now) {
      fail(
        `${where} yields ${now}, but the UI holds ${held.get(playerTile.id())}`
      );
    }

    if (count > 1) {
      fail(`${where} was sent ${count} times in one flush`);
    }

    if (extra.has(playerTile) && count === 0) {
      fail(`${where} had to go, but was not sent`);
    }

    if (count > 0 && !extra.has(playerTile) && before.get(playerTile) === now) {
      fail(`${where} was sent, but the UI already held its yields, ${now}`);
    }
  });

  results.push(
    `${label}: ${counts.size} of ${known.length} squares (${
      changed.length
    } changed), ${(bytes / 1024).toFixed(0)} KB, ${took.toFixed(0)} ms`
  );

  return changed;
};

const run = async (): Promise<void> => {
  // What the UI was given before the map was revealed, then the revealed map.
  receive(patches);

  patches = [];

  cheat!({ name: 'RevealMap' });
  client!.flush();

  await wait(20);

  receive(patches);

  const known = tiles();

  if (known.length < config.width * config.height) {
    fail(`the map was not revealed: ${known.length} squares known`);
  }

  const unheld = known.filter(
    (playerTile) => held.get(playerTile.id()) !== engineYields(playerTile)
  );

  if (unheld.length > 0) {
    fail(
      `before any change, the UI holds other yields than the engine for ${
        unheld.length
      } squares, such as ${unheld[0].x()},${unheld[0].y()}`
    );
  }

  change('Despotism to Anarchy', () => setGovernment(new Anarchy()));

  // Anarchy yields as Despotism does, so these are the squares Monarchy changes from either.
  const changing = change('Anarchy to Monarchy', () =>
      setGovernment(new Monarchy())
    ),
    unchanging = known.filter((playerTile) => !changing.includes(playerTile));

  if (changing.length < 2 || unchanging.length < 3) {
    fail(
      `Monarchy needs to change some squares and leave others: it changed ${changing.length}`
    );
  }

  change('Monarchy to Anarchy', () => setGovernment(new Anarchy()));

  if (
    change('Anarchy to Republic', () => setGovernment(new Republic()))
      .length === 0
  ) {
    fail(`Republic changed no square's yields, so this checks nothing`);
  }

  // Two changes before one flush, as when flushes are held while an action is handled: what goes is measured against
  //  what the UI held before the first.
  change('Republic to Anarchy to Despotism, in one flush', () => {
    setGovernment(new Anarchy());
    setGovernment(new Despotism());
  });

  // A square something else changes in the same flush goes once, whether it was queued before the change of
  //  government or after it, and whether or not the change touched its yields. `tile-improvement:built` is how the
  //  client hears of a square changed by something else.
  const queued = [changing[0], unchanging[0], changing[1], unchanging[1]],
    queue = (playerTile: PlayerTile) =>
      engine.emit('tile-improvement:built', playerTile.tile());

  change(
    'Despotism to Monarchy, with squares changed before and after it',
    () => {
      queue(queued[0]);
      queue(queued[1]);
      setGovernment(new Monarchy());
      queue(queued[2]);
      queue(queued[3]);
    },
    () => new Set(queued)
  );

  // A square the client has no cached yields for: it can't know whether they changed, so the square goes.
  change(
    'Monarchy to Despotism, one square forgotten',
    () => setGovernment(new Despotism()),
    () => {
      const forgotten = unchanging[2];

      forgotten.tile().clearYieldCache(humanPlayer!);

      return new Set([forgotten]);
    }
  );

  finished = true;

  console.log(`PASS governmentTiles (${results.join('; ')})`);

  process.exit(0);
};

engine.on('engine:start', (): void => {
  new Array(config.players).fill(0).forEach((_, index): void => {
    const player = new Player();

    playerRegistryInstance.register(player);

    if (index === 0) {
      humanPlayer = player;
      helper = new SimpleAIClient(player);
      client = new DataTransferClient(player, transport as any);

      clientRegistryInstance.register(client);

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
