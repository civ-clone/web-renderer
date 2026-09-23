// Every ref the frontend can reach resolves, patch after patch (#46).
//
// Drives a seeded game with one automated `DataTransferClient` and applies what
// it sends to an object map the way `Renderer` does. The backend serialises
// some things as `#ref`s on the assumption that the frontend already holds
// them; a ref to something it was never sent reconstitutes as `undefined`, and
// the renderer then trips over the hole (`mandatoryActions` did).

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';

import DataTransferClient from '../../src/js/Engine/DataTransferClient';
import Player from '@civ-clone/core-player/Player';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import DataObject from '@civ-clone/core-data-object/DataObject';
import { ObjectMap, PlainObject } from '../../src/js/UI/lib/reconstituteData';

const TURNS = Number(process.env.PATCH_REFS_TURNS ?? 60);

const objectMap: ObjectMap = { hierarchy: {}, objects: {} },
  missing = new Map<string, number>();

let stopped = false,
  batches = 0;

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `${reason}\n${error instanceof Error ? error.stack : String(error ?? '')}\n`
  );
  process.exit(1);

  throw new Error(reason);
};

// Mirrors `Renderer`'s `setObjectPath`.
const setObjectPath = (object: PlainObject, path: string, value: any): void => {
  const parts = path.replace(/]/g, '').split(/[.[]/),
    lastPart = parts.pop()!,
    target = parts.reduce((object, part) => object?.[part], object);

  if (target) {
    target[lastPart] = value;
  }
};

// Only refs reachable from the hierarchy matter: that is what `reconstituteData` walks.
const checkRefs = (): void => {
  const seen = new Set<any>(),
    visit = (value: any): void => {
      if (!value || typeof value !== 'object' || seen.has(value)) {
        return;
      }

      seen.add(value);

      const ref = value['#ref'];

      if (typeof ref === 'string') {
        if (!(ref in objectMap.objects)) {
          const type = ref.replace(/-[0-9a-z]+$/, '');

          missing.set(type, (missing.get(type) ?? 0) + 1);

          return;
        }

        visit(objectMap.objects[ref]);

        return;
      }

      Object.values(value).forEach(visit);
    };

  visit(objectMap.hierarchy);
};

const transport = {
  receive: () => () => false,
  send: (channel: string, data: any): void => {
    if (data instanceof DataObject) {
      data = data.toPlainObject();
    }

    // Round-trip, as `postMessage` would: nothing may lean on shared identity.
    data = JSON.parse(JSON.stringify(data));

    if (channel === 'gameData') {
      objectMap.hierarchy = data.hierarchy;
      objectMap.objects = data.objects;
    }

    if (channel === 'gameDataPatch') {
      data.forEach((patch: PlainObject) =>
        Object.entries(patch).forEach(([key, { type, index, value }]) => {
          if (type === 'remove') {
            return fail(`unexpected remove patch for ${key}`);
          }

          if (index) {
            setObjectPath(objectMap.objects[key], index, value.hierarchy);
          } else {
            objectMap.objects[key] = value.hierarchy;
          }

          Object.assign(objectMap.objects, value.objects);
        })
      );
    }

    if (channel === 'gameData' || channel === 'gameDataPatch') {
      batches++;
      checkRefs();
    }
  },
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
  if (stopped || turn < TURNS) {
    return;
  }

  stopped = true;

  if (missing.size > 0) {
    console.error(
      `FAIL patchRefs: unresolvable refs over ${turn} turns and ${batches} batches: ${[
        ...missing,
      ]
        .map(([type, count]) => `${type} x${count}`)
        .join(', ')}`
    );

    process.exit(1);
  }

  console.log(
    `PASS patchRefs (${batches} batches over ${turn} turns, every reachable ref resolves)`
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
