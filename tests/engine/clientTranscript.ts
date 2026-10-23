// Everything the human's client sends to the UI, in order, is the same as it was (#449).
//
// The regression net for splitting `DataTransferClient` into modules: each step of that is meant to move code without
// changing a byte on the wire, and this is what says so. It plays a short seeded game with a human
// `DataTransferClient` that is not automated, so its turns take the path the real UI does, and the human is driven by
// a fixed script: units move, Settlers found a city, a city's production changes, research and a government are
// chosen, the trade rates change and there is a revolution. Along the way it uses each cheat the UI offers (RevealMap,
// GrantGold, CreateUnit) and asks each question the UI asks (topCities, civilizationScore, intelligence,
// cityBuildAvailable, unitActions). Every choice it is asked to make is answered with the first option.
//
// Every `send(channel, payload)` is recorded as JSON of what a `ParentTransport` would post, with what JSON would lose
// marked (see `marked`), and the recording is
// compared with tests/engine/fixtures/client-transcript.json: a hash per channel, a hash of the whole sequence, and a
// hash and summary of each message, so that a difference says which message changed first and how. Ids are counters
// per class and the engine's random source is seeded, so two runs send the same thing.
//
// `--update` (`npm run test:client-transcript:update`) rewrites the fixture, as a bump of the engine's packages can
// need. Set `CLIENT_TRANSCRIPT_DUMP` to a path to write the whole recording there.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';
import './lib/spawnedClients';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import DataObject from '@civ-clone/core-data-object/DataObject';
import DataTransferClient from '../../src/js/Engine/DataTransferClient';
import MandatoryPlayerAction from '@civ-clone/core-player/MandatoryPlayerAction';
import Player from '@civ-clone/core-player/Player';
import PlayerAction from '@civ-clone/core-player/PlayerAction';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import Unit from '@civ-clone/core-unit/Unit';
import { createHash } from 'crypto';
import { instance as cityBuildRegistryInstance } from '@civ-clone/core-city-build/CityBuildRegistry';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { instance as turnInstance } from '@civ-clone/core-turn-based-game/Turn';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';

// The game stops when this turn starts, so the human plays the turns before it.
const TURNS = 21;

config.players = 3;
config.width = 40;
config.height = 30;

const update = process.argv.includes('--update'),
  fixturePath = path.join(
    process.cwd(),
    'tests',
    'engine',
    'fixtures',
    'client-transcript.json'
  );

let stopped = false,
  passed = false,
  humanPlayer: Player | null = null,
  humanClient: DataTransferClient | null = null,
  pendingChoice: ((value: any) => void) | null = null,
  // The human's turns handed over so far.
  handovers = 0,
  turnEnded = false,
  // How the action under way is told it has been handled.
  pendingAction: (() => void) | null = null;

const receivers = new Map<string, (...args: any[]) => void>(),
  // Each message as [channel, the JSON a `ParentTransport` would post].
  transcript: [string, string][] = [],
  // What the script did, which the test reports, so that a run that skips part of it is plain to see.
  done = new Map<string, number>();

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `FAIL clientTranscript: ${reason}\n${
      error instanceof Error ? error.stack : String(error ?? '')
    }\n`
  );
  process.exit(1);

  throw new Error(reason);
};

const did = (what: string): void => {
  done.set(what, (done.get(what) ?? 0) + 1);
};

const transport = {
  receive: (channel: string, handler: (...args: any[]) => void) => {
    receivers.set(channel, handler);

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
  // A reply to a request, with its id (#470), recorded as `send` records anything else.
  reply: (channel: string, data: any, id: number): void =>
    transport.send(channel, data, id),
  // `id` only from `reply`.
  send: (channel: string, data: any, id?: number): void => {
    if (stopped) {
      return;
    }

    const plain = data instanceof DataObject ? data.toPlainObject() : data;

    // As `ParentTransport` and `postMessage` would: a reply to a request carries its id (#470).
    transcript.push([
      channel,
      JSON.stringify(id === undefined ? plain : { data: plain, id }, marked),
    ]);

    if (channel === 'chooseFromList') {
      const meta = data as ChoiceMeta<any>,
        respond = pendingChoice;

      did('chooseFromList');

      // `receiveOnce` is registered after the send, so answer on the next tick, with the first option.
      setTimeout(() => (pendingChoice ?? respond)!(meta.choices()[0]?.id()));

      return;
    }

    if (channel === 'turnStarted') {
      handovers++;
      turnEnded = false;

      setTimeout(() =>
        playTurn().catch((error) => fail('the human could not play', error))
      );

      return;
    }

    if (channel === 'turnEnded') {
      turnEnded = true;

      return;
    }

    if (channel === 'actionHandled' && pendingAction !== null) {
      const resolve = pendingAction;

      pendingAction = null;

      resolve();
    }
  },
};

// What `postMessage` keeps and JSON doesn't (#503): JSON leaves out a key whose value is `undefined` (and makes one in
//  an array `null`), and makes `NaN` and the infinities `null`, so a difference in any of them would not be seen. Each
//  is recorded as a marker of its own instead.
const marked = (_key: string, value: unknown): unknown =>
  value === undefined
    ? '[undefined]'
    : typeof value === 'number' && !Number.isFinite(value)
    ? `[${value}]`
    : value;

// Sends an action as the UI does, and waits for it to be handled.
const act = (action: { name: string; [key: string]: any }): Promise<void> =>
  new Promise<void>((resolve) => {
    const label = `${action.name}${
        action.unitAction ? ` ${action.unitAction}` : ''
      }`,
      timeout = setTimeout(
        () => fail(`${label} was never handled: ${JSON.stringify(action)}`),
        10000
      );

    did(label);

    pendingAction = () => {
      clearTimeout(timeout);
      resolve();
    };

    receivers.get('action')!(action);
  });

// Each question is asked with an id of its own, as the page's `request` asks it (#470), which the answer echoes.
let requestId = 0;

const request = (channel: string, data?: any): void => {
  const receiver = receivers.get(channel);

  if (!receiver) {
    fail(`the client does not answer ${channel}`);
  }

  did(channel);

  receiver!(data, { id: ++requestId });
};

const cheat = (name: string, value?: any): void => {
  did(`cheat ${name}`);

  receivers.get('cheat')!({ name, value });
};

const ourActions = (name: string): PlayerAction[] =>
  humanPlayer!.actions().filter((action) => action.constructor.name === name);

// A unit's action on its own square or the first neighbour that offers it, as the UI would send it.
const unitAction = (
  unit: Unit,
  names: string[]
): { name: string; [key: string]: any } | null => {
  const playerWorld = playerWorldRegistryInstance.getByPlayer(humanPlayer!);

  for (const name of names) {
    for (const tile of [unit.tile(), ...unit.tile().getNeighbours()]) {
      const playerTile = playerWorld.getByTile(tile);

      if (
        playerTile &&
        unit.actions(tile).some((action) => action.sourceClass().name === name)
      ) {
        return {
          name: 'ActiveUnit',
          id: unit.id(),
          unitAction: name,
          target: playerTile.id(),
        };
      }
    }
  }

  return null;
};

// What the UI does besides what it must, by which of the human's turns it is.
const extras = async (): Promise<void> => {
  const [city] = cityRegistryInstance.getByPlayer(humanPlayer!),
    [unit] = unitRegistryInstance.getByPlayer(humanPlayer!);

  if (handovers === 1) {
    request('topCities');
    request('civilizationScore');
    request('intelligence');

    if (unit) {
      request('unitActions', unit.id());
    }

    return;
  }

  if (handovers === 2) {
    if (!city) {
      fail('the human has no city on its second turn');
    }

    cheat('RevealMap');
    cheat('GrantGold', { amount: 100 });
    cheat('CreateUnit', {
      unitType: 'Warrior',
      x: city.tile().x(),
      y: city.tile().y(),
    });

    request(
      'cityBuildAvailable',
      cityBuildRegistryInstance.getByCity(city).id()
    );

    const [changeProduction] = ourActions('ChangeProduction'),
      cityBuild: any = changeProduction?.value(),
      building = cityBuild?.building()?.item().name,
      [other] = (cityBuild?.available() ?? []).filter(
        (buildItem: any) => buildItem.item().name !== building
      );

    if (other) {
      await act({
        name: 'ChangeProduction',
        id: cityBuild.id(),
        chosen: other.item().name,
      });
    }

    const [adjustTradeRates] = ourActions('AdjustTradeRates'),
      rates: any[] | undefined = (adjustTradeRates?.value() as any)?.all();

    if (rates) {
      // The same values in another order: each is within the government's limit, as they are now.
      await act({
        name: 'AdjustTradeRates',
        id: adjustTradeRates.value().id(),
        value: rates.map((rate: any, index: number) => [
          rate.constructor.name,
          rates[(index + 1) % rates.length].value(),
        ]),
      });
    }

    return;
  }

  if (handovers === 3) {
    const [revolution] = ourActions('Revolution');

    if (revolution) {
      await act({ name: 'Revolution', id: revolution.value().id() });
    }

    request('topCities', 5);
    request('civilizationScore');
    request('intelligence');

    if (city) {
      request(
        'cityBuildAvailable',
        cityBuildRegistryInstance.getByCity(city).id()
      );
    }

    if (unit) {
      request('unitActions', unit.id());
    }
  }
};

// One of the human's turns: the extras, then each mandatory action in turn, then the end of the turn.
const playTurn = async (): Promise<void> => {
  const acted = new Map<Unit, number>();

  await extras();

  for (let step = 0; step < 200; step++) {
    if (stopped || turnEnded) {
      return;
    }

    const [mandatory] = humanPlayer!
      .actions()
      .filter(
        (action) =>
          action instanceof MandatoryPlayerAction &&
          action.constructor.name !== 'EndTurn'
      );

    if (!mandatory) {
      await act({ name: 'EndTurn' });

      if (!turnEnded && !stopped) {
        fail('ending the turn was refused with nothing left to do');
      }

      return;
    }

    const name = mandatory.constructor.name,
      value: any = mandatory.value();

    if (name === 'ActiveUnit') {
      const unit = value as Unit,
        times = acted.get(unit) ?? 0,
        action = unitAction(
          unit,
          times >= 2
            ? ['NoOrders', 'Fortify', 'Sleep']
            : unit.constructor.name === 'Settlers'
            ? ['FoundCity', 'Move', 'NoOrders']
            : ['Move', 'NoOrders']
        );

      if (action === null) {
        return fail(`${unit.id()} has nothing it can do`);
      }

      acted.set(unit, times + 1);

      await act(action);

      continue;
    }

    if (name === 'CityBuild') {
      await act({
        name,
        id: value.id(),
        chosen: value.available()[0].item().name,
      });

      continue;
    }

    if (name === 'ChooseResearch' || name === 'ChooseGovernment') {
      await act({ name, id: value.id(), chosen: value.available()[0].name });

      continue;
    }

    return fail(`the script does not know how to do ${name}`);
  }

  fail('the human could not end its turn in 200 actions');
};

const hash = (text: string): string =>
  createHash('sha256').update(text).digest('hex');

// A message in a few words, for saying how it changed: the parts of the game a patch carries, or the start of anything
//  else.
const summary = ([channel, json]: [string, string]): string => {
  if (channel === 'gameDataPatch') {
    const parts = (JSON.parse(json) as any[]).flatMap((patch) =>
      Object.entries(patch).map(
        ([key, { type, index }]: [string, any]) =>
          `${type} ${key}${index ? `[${index}]` : ''}`
      )
    );

    return `${parts.slice(0, 6).join(', ')}${
      parts.length > 6 ? `, and ${parts.length - 6} more` : ''
    }`;
  }

  return json.length > 80 ? `${json.slice(0, 77)}...` : json;
};

type Fixture = {
  turns: number;
  sequence: { count: number; hash: string };
  channels: { [channel: string]: { count: number; hash: string } };
  // `channel hash summary` for each message, in order: a hash prefix is enough to say which one changed first.
  messages: string[];
};

const record = (): Fixture => {
  const channels: Fixture['channels'] = {};

  [...new Set(transcript.map(([channel]) => channel))]
    .sort()
    .forEach((channel) => {
      const messages = transcript.filter(([sent]) => sent === channel);

      channels[channel] = {
        count: messages.length,
        hash: hash(messages.map(([, json]) => json).join('\n')),
      };
    });

  return {
    turns: TURNS,
    sequence: {
      count: transcript.length,
      hash: hash(
        transcript.map(([channel, json]) => `${channel} ${json}`).join('\n')
      ),
    },
    channels,
    messages: transcript.map(
      (message) =>
        `${message[0]} ${hash(message[1]).slice(0, 12)} ${summary(message)}`
    ),
  };
};

const dump = (file: string): void =>
  fs.writeFileSync(
    file,
    transcript.map(([channel, json]) => `${channel} ${json}`).join('\n') + '\n'
  );

const compare = (expected: Fixture, actual: Fixture): string[] => {
  const differences: string[] = [];

  new Set([
    ...Object.keys(expected.channels),
    ...Object.keys(actual.channels),
  ]).forEach((channel) => {
    const was = expected.channels[channel],
      is = actual.channels[channel];

    if (was?.hash === is?.hash) {
      return;
    }

    const index = (messages: string[]) =>
        messages.filter((message) => message.startsWith(`${channel} `)),
      before = index(expected.messages),
      after = index(actual.messages),
      first = before.findIndex((message, i) => message !== after[i]),
      at = first === -1 ? before.length : first;

    differences.push(
      `${channel}: ${was?.count ?? 0} message(s) before, ${
        is?.count ?? 0
      } now; the first to differ is ${channel}[${at}]\n  - ${
        before[at] ?? '(none)'
      }\n  + ${after[at] ?? '(none)'}`
    );
  });

  if (expected.sequence.hash !== actual.sequence.hash) {
    const at = expected.messages.findIndex(
        (message, i) => message !== actual.messages[i]
      ),
      first = at === -1 ? expected.messages.length : at;

    differences.push(
      `the sequence: ${expected.sequence.count} message(s) before, ${
        actual.sequence.count
      } now; the first to differ is message ${first}\n  - ${
        expected.messages[first] ?? '(none)'
      }\n  + ${actual.messages[first] ?? '(none)'}`
    );
  }

  return differences;
};

const finish = (): void => {
  stopped = true;

  const expected = [
    'ActiveUnit FoundCity',
    'ActiveUnit Move',
    'ChangeProduction',
    'AdjustTradeRates',
    'Revolution',
    'ChooseGovernment',
    'ChooseResearch',
    'CityBuild',
    'EndTurn',
    'cheat RevealMap',
    'cheat GrantGold',
    'cheat CreateUnit',
    'topCities',
    'civilizationScore',
    'intelligence',
    'cityBuildAvailable',
    'unitActions',
  ].filter((what) => !done.has(what));

  if (expected.length > 0) {
    fail(
      `the script never got to ${expected.join(', ')} in ${
        TURNS - 1
      } turns, so the transcript does not cover it`
    );
  }

  const actual = record();

  if (process.env.CLIENT_TRANSCRIPT_DUMP) {
    dump(process.env.CLIENT_TRANSCRIPT_DUMP);
  }

  const covered = [...done.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([what, count]) => `${what} x${count}`)
    .join(', ');

  if (update) {
    fs.writeFileSync(fixturePath, JSON.stringify(actual, null, 2) + '\n');

    passed = true;

    console.log(
      `UPDATED clientTranscript: ${actual.sequence.count} messages over ${
        TURNS - 1
      } turns written to ${path.relative(
        process.cwd(),
        fixturePath
      )} (${covered})`
    );

    process.exit(0);
  }

  if (!fs.existsSync(fixturePath)) {
    fail(
      `there is no fixture at ${fixturePath}: run \`npm run test:client-transcript:update\``
    );
  }

  const differences = compare(
    JSON.parse(fs.readFileSync(fixturePath, 'utf8')),
    actual
  );

  if (differences.length > 0) {
    const file = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'client-transcript-')),
      'transcript.txt'
    );

    dump(file);

    // A change in what the engine does changes what the client sends with it, so a bump of the `@civ-clone` packages
    //  can fail this with no change here (#503).
    fail(
      `what the client sent changed (the whole of it is in ${file}):\n${differences.join(
        '\n'
      )}\nIf this follows a bump of the engine's packages and the change is theirs, not the client's, record it again with \`npm run test:client-transcript:update\` and commit the fixture with the bump.`
    );
  }

  passed = true;

  console.log(
    `PASS clientTranscript (${actual.sequence.count} messages on ${
      Object.keys(actual.channels).length
    } channels over ${TURNS - 1} turns are as they were: ${covered})`
  );

  process.exit(0);
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

  finish();
});

engine.on('player:defeated', (player: Player): void => {
  if (!stopped && player === humanPlayer) {
    fail(`the human was defeated on turn ${turnInstance.value()}`);
  }
});

engine.on('engine:start', (): void => {
  new Array(config.players).fill(0).forEach((_, index): void => {
    const player = new Player();

    playerRegistryInstance.register(player);

    if (index === 0) {
      humanPlayer = player;
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

// A run that stops before it compares anything has checked nothing (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !passed) {
    process.stderr.write(
      `FAIL clientTranscript: the game stopped on turn ${turnInstance.value()} before the transcript was compared\n`
    );
    process.exitCode = 1;
  }
});
process.on('uncaughtException', (error) => fail('uncaught exception', error));
process.on('unhandledRejection', (error) => fail('unhandled rejection', error));

engine.start();

import('../../src/js/plugins')
  .then(() => engine.emit('plugins:load:end'))
  .catch((error) => fail('failed to load plugins', error));
