// Several prompts open at once (#491, #526). A second `chooseFromList` used to stop listening for the first one's
//  answer, so the first never settled. If it was a step of the talks, every later action of the turn waited for them for
//  good: performed, but with no patch and no `actionHandled`. And `EndTurn` was accepted while the talks at the start
//  of the turn were open, which let a computer player's talks cancel them.
//
// First `ChoicePrompt` alone, over a transport whose `receiveOnce` fires once, as the real ones do:
//  (a) two prompts open at once, answered in either order, each settle with their own choice;
//  (d) an answer that is none of the choices open is ignored without throwing, and with one prompt open it is chosen
//      at random, as before; `cancel()` stops listening for every prompt open.
// Then a seeded game with a human `DataTransferClient`, as `diplomats.ts` drives it, the page answering each window
//  itself:
//  - turn 1: talks at the start of the turn, a second prompt while they are open, and a unit's action, which waits for
//    the talks: once both are answered, the action gets its patch and `actionHandled`;
//  - turn 2, (c): `EndTurn` while the talks at the start of the turn are open is answered once they are over, without
//    ending the turn, and the next `EndTurn` ends it;
//  - turn 3, (b): a capture that offers an advance to steal, with another civilization's unit beside the city, so the
//    same move opens talks: both answers land, the advance is the one chosen, and a later unit's action gets its patch
//    and `actionHandled`.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';
import './lib/spawnedClients';

import {
  Alphabet,
  BronzeWorking,
  CeremonialBurial,
  CodeOfLaws,
  HorsebackRiding,
  Masonry,
  Pottery,
} from '@civ-clone/civ1-science/Advances';
import { EndTurn } from '@civ-clone/civ1-player/PlayerActions';
import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import ChoicePrompt from '../../src/js/Engine/Client/ChoicePrompt';
import City from '@civ-clone/core-city/City';
import DataTransferClient from '../../src/js/Engine/DataTransferClient';
import MandatoryPlayerAction from '@civ-clone/core-player/MandatoryPlayerAction';
import Negotiation from '@civ-clone/core-diplomacy/Negotiation';
import Player from '@civ-clone/core-player/Player';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import Tile from '@civ-clone/core-world/Tile';
import Unit from '@civ-clone/core-unit/Unit';
import { Warrior } from '@civ-clone/civ1-unit/Units';
import { instance as cityGrowthRegistryInstance } from '@civ-clone/core-city-growth/CityGrowthRegistry';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as interactionRegistryInstance } from '@civ-clone/core-diplomacy/InteractionRegistry';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as playerResearchRegistryInstance } from '@civ-clone/core-science/PlayerResearchRegistry';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';

let passed = false;

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `FAIL choosePrompts: ${reason}\n${
      error instanceof Error ? error.stack : String(error ?? '')
    }\n`
  );
  process.exit(1);

  throw new Error(reason);
};

// A run that stops before it reports has checked nothing (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !passed) {
    process.stderr.write('FAIL choosePrompts: stopped before the checks ran\n');
    process.exitCode = 1;
  }
});

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Waits up to `ms` for `predicate`, or fails with `description`.
const until = async (
  predicate: () => boolean,
  description: string,
  ms: number = 3000
): Promise<void> => {
  const end = Date.now() + ms;

  while (!predicate()) {
    if (Date.now() > end) {
      fail(`timed out waiting: ${description}\n  sent: ${log.join(', ')}`);
    }

    await wait(5);
  }
};

const expect = (description: string, actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(
      `${description}\n    expected: ${JSON.stringify(
        expected
      )}\n    actual:   ${JSON.stringify(actual)}`
    );
  }
};

// A transport whose receivers are those of `WorkerTransport` and `ParentTransport`: `receive` hears every message on
//  its channel, `receiveOnce` the next one only, and a receiver added while a message is delivered hears the next.
const makeTransport = (send: (channel: string, data: any) => void) => {
  const receivers = new Map<string, Set<(...args: any[]) => void>>(),
    receive = (channel: string, handler: (...args: any[]) => void) => {
      if (!receivers.has(channel)) {
        receivers.set(channel, new Set());
      }

      receivers.get(channel)!.add(handler);

      return (): void => {
        receivers.get(channel)!.delete(handler);
      };
    };

  return {
    receive,
    receiveOnce: (channel: string, handler: (...args: any[]) => void) => {
      const once = (...args: any[]): void => {
        handler(...args);

        dispose();
      };
      const dispose = receive(channel, once);

      return dispose;
    },
    send,
    deliver: (channel: string, data: unknown): void =>
      [...(receivers.get(channel) ?? [])].forEach((handler) => handler(data)),
    listening: (channel: string): number => receivers.get(channel)?.size ?? 0,
  };
};

// What a promise has settled as so far.
const settled = async (promise: Promise<unknown>): Promise<unknown> => {
  let result: unknown = 'unsettled';

  promise.then((value) => (result = value));

  await wait(1);

  return result;
};

// ---- ChoicePrompt alone -----------------------------------------------------------------------------------------

const promptsAlone = async (): Promise<void> => {
  const sent: ChoiceMeta<any>[] = [],
    transport = makeTransport((channel, data) => {
      if (channel === 'chooseFromList') {
        sent.push(data);
      }
    }),
    choicePrompt = new ChoicePrompt(transport as any, () => (object) => object),
    warnings: string[] = [],
    warn = console.warn;

  console.warn = (message: string) => warnings.push(message);

  const ask = (values: string[], key: any) => {
      const meta = new ChoiceMeta(values as any[], key);

      return [
        meta,
        choicePrompt.promptChoice(meta, () => Promise.resolve('at random')),
      ] as const;
    },
    idOf = (meta: ChoiceMeta<any>, value: string): string =>
      meta
        .choices()
        .find((choice) => choice.value() === value)!
        .id();

  // (a) Answered in the order they were sent, and the other way round.
  for (const order of ['first', 'second']) {
    const [talk, talkChosen] = ask(['Initiate', 'Terminate'], 'talk'),
      [steal, stealChosen] = ask(['BronzeWorking', 'Alphabet'], 'steal');

    expect(`(a) both sent (${order} first)`, sent.splice(0).length, 2);
    expect(
      `(a) one listener for both (${order} first)`,
      transport.listening('chooseFromList'),
      1
    );

    const answers =
      order === 'first'
        ? [idOf(talk, 'Terminate'), idOf(steal, 'Alphabet')]
        : [idOf(steal, 'Alphabet'), idOf(talk, 'Terminate')];

    transport.deliver('chooseFromList', answers[0]);
    expect(
      `(a) one answered, the other still listened for (${order} first)`,
      transport.listening('chooseFromList'),
      1
    );
    transport.deliver('chooseFromList', answers[1]);

    expect(
      `(a) each settles with its own choice (${order} first)`,
      [await settled(talkChosen), await settled(stealChosen)],
      ['Terminate', 'Alphabet']
    );
    expect(
      `(a) nothing listened for once both are answered (${order} first)`,
      transport.listening('chooseFromList'),
      0
    );
  }

  expect('(a) no warnings', warnings.splice(0), []);

  // (d) An answer that is none of the choices open, with two open: ignored, and both still answered.
  const [first, firstChosen] = ask(['A', 'B'], 'first'),
    [second, secondChosen] = ask(['C', 'D'], 'second');

  transport.deliver('chooseFromList', 'no-such-choice');
  expect(
    '(d) an unknown answer with two prompts open settles neither',
    [await settled(firstChosen), await settled(secondChosen)],
    ['unsettled', 'unsettled']
  );
  expect('(d) and is warned of', warnings.splice(0), [
    "No choice found for 'no-such-choice' against the 2 prompts open, ignored.",
  ]);

  transport.deliver('chooseFromList', idOf(second, 'D'));
  transport.deliver('chooseFromList', idOf(first, 'B'));
  expect(
    '(d) both are answered after it',
    [await settled(firstChosen), await settled(secondChosen)],
    ['B', 'D']
  );

  // With none open, nothing listens for it.
  transport.deliver('chooseFromList', 'no-such-choice');
  expect(
    '(d) an answer with no prompt open is not listened for',
    [transport.listening('chooseFromList'), warnings.splice(0)],
    [0, []]
  );

  // With one open, it can only be its answer: chosen at random, as before.
  const [only, onlyChosen] = ask(['E', 'F'], 'only');

  transport.deliver('chooseFromList', 'no-such-choice');
  expect(
    '(d) an unknown answer with one prompt open is chosen at random',
    [await settled(onlyChosen), warnings.splice(0)],
    [
      'at random',
      [
        `No choice found for 'no-such-choice' against '${only.id()}', using super.`,
      ],
    ]
  );

  // `cancel()` stops listening for every prompt open.
  const [cancelledFirst, cancelledFirstChosen] = ask(['G', 'H'], 'first'),
    [, cancelledSecondChosen] = ask(['I', 'J'], 'second');

  choicePrompt.cancel();
  transport.deliver('chooseFromList', idOf(cancelledFirst, 'G'));
  expect(
    'cancel() leaves nothing listened for, and neither prompt settles',
    [
      transport.listening('chooseFromList'),
      await settled(cancelledFirstChosen),
      await settled(cancelledSecondChosen),
    ],
    [0, 'unsettled', 'unsettled']
  );

  console.warn = warn;
};

// ---- A seeded game --------------------------------------------------------------------------------------------

let humanPlayer: Player | null = null,
  humanClient: DataTransferClient | null = null,
  helper: SimpleAIClient | null = null,
  turnsStarted = 0,
  // The page answers each window it is shown on the next tick, with what the human's own AI would choose, unless a
  //  scenario answers them itself.
  answerWindows = true;

// What the page has been sent, in order.
const log: string[] = [];
// The windows open on the page, in the order they were shown.
const windows: ChoiceMeta<any>[] = [];

const transport = makeTransport((channel: string, data: any): void => {
  if (channel === 'chooseFromList') {
    const meta = data as ChoiceMeta<any>;

    log.push(`chooseFromList(${meta.key()})`);
    windows.push(meta);

    if (answerWindows) {
      setTimeout(() => answerAll());
    }

    return;
  }

  if (channel === 'actionHandled') {
    log.push(
      `actionHandled(${[data.name, data.unitAction].filter(Boolean).join(':')})`
    );

    return;
  }

  if (['gameDataPatch', 'turnStarted', 'turnEnded'].includes(channel)) {
    log.push(channel);
  }

  if (channel === 'turnStarted') {
    turnsStarted++;

    onTurnStarted(turnsStarted);
  }
});

// The page answers a window: with the choice whose value is `value`, or with what the human's own AI would choose.
const answer = async (
  meta: ChoiceMeta<any>,
  ...value: [unknown] | []
): Promise<void> => {
  const index = windows.indexOf(meta);

  if (index === -1) {
    fail(`the page has no ${meta.key()} window open to answer`);
  }

  windows.splice(index, 1);

  const chosen =
      value.length > 0 ? value[0] : await helper!.chooseFromList(meta),
    [choice] = meta.choices().filter((choice) => choice.value() === chosen);

  log.push(`answer(${meta.key()})`);
  transport.deliver('chooseFromList', choice?.id());
};

const answerAll = (): void => {
  windows.slice().forEach((meta) => {
    answer(meta).catch((error) => fail('the page could not answer', error));
  });
};

const openWindow = (key: string): ChoiceMeta<any> | undefined =>
  windows.find((meta) => meta.key() === key);

const sendAction = (action: any): void => transport.deliver('action', action);

const since = (from: number): string[] => log.slice(from);

const free = (tile: Tile): boolean =>
  tile.isLand() &&
  cityRegistryInstance.getByTile(tile) === null &&
  unitRegistryInstance.getByTile(tile).length === 0;

const others = (): Player[] =>
  playerRegistryInstance.entries().filter((player) => player !== humanPlayer);

const negotiationsWith = (other: Player): number =>
  interactionRegistryInstance
    .getByPlayers(humanPlayer!, other)
    .filter((interaction) => interaction instanceof Negotiation).length;

// Leaves the human with nothing to do but end the turn.
const nothingLeftToDo = (): void => {
  unitRegistryInstance
    .getByPlayer(humanPlayer!)
    .forEach((unit) => unit.moves().set(0));

  const research = playerResearchRegistryInstance.getByPlayer(humanPlayer!);

  if (research.researching() === null) {
    research.research(research.available()[0]);
  }

  const mandatory = humanPlayer!
    .actions()
    .filter((action) => action instanceof MandatoryPlayerAction);

  if (mandatory.length !== 1 || !(mandatory[0] instanceof EndTurn)) {
    fail(
      `the human has more to do than end the turn: ${mandatory
        .map((action) => action.constructor.name)
        .join(', ')}`
    );
  }
};

// The action the UI sends for one of the human's units, on `target`.
const unitAction = (unit: Unit, name: string, target: Tile): any => {
  const playerTile = playerWorldRegistryInstance
    .getByPlayer(humanPlayer!)
    .getByTile(target);

  if (!playerTile) {
    fail(`the human has not seen the tile ${unit.id()} is acting on`);
  }

  if (
    !unit.actions(target).some((action) => action.sourceClass().name === name)
  ) {
    fail(
      `${unit.id()} is not offered ${name}: ${unit
        .actions(target)
        .map((action) => action.sourceClass().name)
        .join(', ')}`
    );
  }

  return {
    name: 'ActiveUnit',
    id: unit.id(),
    unitAction: name,
    target: playerTile!.id(),
  };
};

// The sequence each action is answered with: a patch, then `actionHandled`.
const answeredWithAPatch = (from: number, handled: string): boolean => {
  const sent = since(from),
    at = sent.indexOf(`actionHandled(${handled})`);

  return at > 0 && sent[at - 1] === 'gameDataPatch';
};

const onTurnStarted = (turn: number): void => {
  if (turn === 1) {
    // Talks at the start of the turn, as a Meet with King or a GoTo's meeting starts them.
    answerWindows = false;
    engine.emit('player:meet-with-king', humanPlayer!, others()[0]);

    setTimeout(() =>
      displacedTalks().catch((error) => fail('turn 1 failed', error))
    );

    return;
  }

  if (turn === 2) {
    answerWindows = false;
    nothingLeftToDo();
    engine.emit('player:meet-with-king', humanPlayer!, others()[0]);

    // As the page's auto end of turn sends it on `turnStarted`.
    setTimeout(() =>
      endTurnWhileTalking().catch((error) => fail('turn 2 failed', error))
    );

    return;
  }

  if (turn === 3) {
    setTimeout(() =>
      captureWithTalks().catch((error) => fail('turn 3 failed', error))
    );
  }
};

// Turn 1: a second prompt while the talks at the start of the turn are open, and a unit's action waiting for them.
const displacedTalks = async (): Promise<void> => {
  const rival = others()[0],
    talksBefore = negotiationsWith(rival);

  await until(
    () => openWindow('negotiation.next-step') !== undefined,
    'the talks at the start of the turn'
  );

  const second = humanClient!.chooseFromList(
      new ChoiceMeta(
        [BronzeWorking, Alphabet] as any[],
        'capture-city.steal-advance'
      )
    ),
    [settlers] = unitRegistryInstance.getByPlayer(humanPlayer!),
    from = log.length;

  sendAction(unitAction(settlers, 'NoOrders', settlers.tile()));
  await wait(50);

  expect(
    "turn 1: the unit's action waits for the talks",
    since(from).filter((entry) => entry.startsWith('actionHandled')),
    []
  );

  // The page answers the talks, on top, then the second window.
  await answer(openWindow('negotiation.next-step')!);
  await answer(openWindow('capture-city.steal-advance')!, Alphabet);

  answerWindows = true;
  answerAll();

  await until(
    () => since(from).includes('actionHandled(ActiveUnit:NoOrders)'),
    "turn 1: the unit's action is answered once the talks are over"
  );

  expect(
    "turn 1: the unit's action gets its patch, then actionHandled",
    answeredWithAPatch(from, 'ActiveUnit:NoOrders'),
    true
  );
  expect(
    'turn 1: the second prompt settles with its own choice',
    await settled(second),
    Alphabet
  );
  expect(
    'turn 1: the talks are over',
    negotiationsWith(rival),
    talksBefore + 1
  );

  nothingLeftToDo();

  const ending = log.length;

  sendAction({ name: 'EndTurn' });

  await until(
    () => since(ending).includes('turnEnded'),
    'turn 1 ends with nothing left to do'
  );
};

// Turn 2, (c): `EndTurn` while the talks at the start of the turn are open.
const endTurnWhileTalking = async (): Promise<void> => {
  const from = log.length;

  sendAction({ name: 'EndTurn' });

  await until(
    () => openWindow('negotiation.next-step') !== undefined,
    'the talks at the start of turn 2'
  );
  await wait(50);

  expect(
    'turn 2: EndTurn sent while the talks are open is not answered yet',
    since(from).filter(
      (entry) => entry.startsWith('actionHandled') || entry === 'turnEnded'
    ),
    []
  );

  answerWindows = true;
  answerAll();

  await until(
    () => since(from).includes('actionHandled(EndTurn)'),
    'turn 2: EndTurn is answered once the talks are over'
  );
  await wait(50);

  const answered = since(from),
    lastAnswer = answered.lastIndexOf('answer(negotiation.next-step)'),
    handled = answered.indexOf('actionHandled(EndTurn)');

  expect(
    'turn 2: EndTurn is answered after the talks, with a patch, and the turn goes on',
    [
      lastAnswer < handled,
      answered[handled - 1],
      answered.includes('turnEnded'),
      windows.length,
    ],
    [true, 'gameDataPatch', false, 0]
  );

  const again = log.length;

  sendAction({ name: 'EndTurn' });

  await until(
    () => since(again).includes('turnEnded'),
    'turn 2: the next EndTurn ends the turn'
  );
};

// Turn 3, (b): a capture that offers an advance to steal, with another civilization beside the city.
const captureWithTalks = async (): Promise<void> => {
  // Not the civilization of the talks on turns 1 and 2, which may have made peace.
  const [, owner, neighbour] = others();

  if (!owner || !neighbour) {
    fail('the game needs at least 4 players');
  }

  const [home] = unitRegistryInstance.getByPlayer(humanPlayer!),
    // A tile for the city, with a free tile beside it for the capturing unit and another, not beside that one, for the
    //  neighbour's unit.
    [site, attackFrom, neighbourAt] =
      home
        .tile()
        .getSurroundingArea(6)
        .entries()
        .filter((tile) => free(tile) && tile.distanceFrom(home.tile()) >= 3)
        .map((tile): (Tile | undefined)[] => {
          const beside = tile.getNeighbours().filter(free),
            [attack] = beside,
            [other] = beside.filter(
              (candidate) =>
                candidate !== attack && candidate.distanceFrom(attack) > 1
            );

          return [tile, attack, other];
        })
        .find(([, attack, other]) => attack && other) ?? [];

  if (!site || !attackFrom || !neighbourAt) {
    fail('no land for a city with room around it');
  }

  // An undefended city of the owner's, which knows advances the human doesn't. Of size 3: a city of size 1 is destroyed
  //  when it is captured.
  const city = new City(owner, site!, 'Library'),
    cityGrowth = cityGrowthRegistryInstance.getByCity(city),
    ownerResearch = playerResearchRegistryInstance.getByPlayer(owner),
    humanResearch = playerResearchRegistryInstance.getByPlayer(humanPlayer!);

  while (cityGrowth.size() < 3) {
    cityGrowth.grow();
  }

  [
    Alphabet,
    BronzeWorking,
    CeremonialBurial,
    CodeOfLaws,
    HorsebackRiding,
    Masonry,
    Pottery,
  ].forEach((AdvanceType) => {
    if (!ownerResearch.completed(AdvanceType)) {
      ownerResearch.addAdvance(AdvanceType);
    }
  });

  const stealable = ownerResearch
    .complete()
    .map((advance) => advance.sourceClass())
    .filter((AdvanceType) => !humanResearch.completed(AdvanceType as any));

  if (stealable.length < 2) {
    fail('the city knows fewer than 2 advances the human does not');
  }

  new Warrior(null, neighbour, neighbourAt!);

  const attacker = new Warrior(null, humanPlayer!, attackFrom!),
    talksBefore = negotiationsWith(neighbour);

  // Moves enough for any terrain: a move short of its cost can fail.
  attacker.moves().set(3);

  playerWorldRegistryInstance
    .getByPlayer(humanPlayer!)
    .register(site!, ...site!.getNeighbours());

  humanClient!.flush();
  await wait(20);

  answerWindows = false;

  const captureName = attacker
      .actions(site!)
      .some((action) => action.sourceClass().name === 'CaptureCity')
      ? 'CaptureCity'
      : 'SneakCaptureCity',
    from = log.length;

  sendAction(unitAction(attacker, captureName, site!));

  await wait(50);

  if (city.player() !== humanPlayer || attacker.tile() !== site) {
    fail(
      `the city was not captured: ${
        city.destroyed() ? 'destroyed' : 'still standing'
      }, the attacker ${attacker.tile() === site ? 'in it' : 'outside'}`
    );
  }

  await until(
    () =>
      openWindow('capture-city.steal-advance') !== undefined &&
      openWindow('negotiation.next-step') !== undefined,
    'the steal-advance and talks windows open together'
  );

  // The page answers the talks, on top, then the advance to steal.
  const steal = openWindow('capture-city.steal-advance')!,
    [, chosen] = steal.choices().map((choice) => choice.value());

  await answer(openWindow('negotiation.next-step')!);
  await answer(steal, chosen);

  answerWindows = true;
  answerAll();

  const handled = `ActiveUnit:${captureName}`;

  await until(
    () => since(from).includes(`actionHandled(${handled})`),
    'the capture is answered once both windows are'
  );

  expect(
    'turn 3: the capture gets its patch, then actionHandled',
    answeredWithAPatch(from, handled),
    true
  );
  expect(
    'turn 3: the advance chosen is stolen',
    humanResearch.completed(chosen as any),
    true
  );
  expect(
    'turn 3: the talks with the neighbour are over',
    negotiationsWith(neighbour),
    talksBefore + 1
  );

  // A later unit's action gets its patch and `actionHandled`.
  const [later] = attacker
      .tile()
      .getSurroundingArea(4)
      .entries()
      .filter((tile) => free(tile) && tile.getNeighbours().some(free)),
    walker = new Warrior(null, humanPlayer!, later),
    [to] = later.getNeighbours().filter(free);

  playerWorldRegistryInstance
    .getByPlayer(humanPlayer!)
    .register(later, ...later.getNeighbours());
  humanClient!.flush();
  await wait(20);

  const after = log.length;

  sendAction(unitAction(walker, 'Move', to));

  await until(
    () => since(after).includes('actionHandled(ActiveUnit:Move)'),
    "a later unit's action is answered"
  );

  expect(
    "turn 3: a later unit's action gets its patch, then actionHandled",
    answeredWithAPatch(after, 'ActiveUnit:Move'),
    true
  );

  passed = true;

  console.log(
    'PASS choosePrompts (two prompts answered in either order, an unknown answer ignored, talks at the start of the turn with a second prompt open and a unit waiting, EndTurn while they are open, and a capture offering an advance and talks at once)'
  );

  process.exit(0);
};

engine.on('engine:start', (): void => {
  new Array(Math.max(config.players, 4)).fill(0).forEach((_, index): void => {
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

engine.setOption('players', Math.max(config.players, 4));
engine.setOption('height', config.height);
engine.setOption('width', config.width);

process.on('uncaughtException', (error) => fail('uncaught exception', error));
process.on('unhandledRejection', (error) => fail('unhandled rejection', error));

promptsAlone()
  .then(() => {
    engine.start();

    return import('../../src/js/plugins');
  })
  .then(() => engine.emit('plugins:load:end'))
  .catch((error) => fail('failed', error));
