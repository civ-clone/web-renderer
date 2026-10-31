// One game's start, out of `Renderer.ts` (#344): `GameSession#start` registers every game receiver before it returns
//  (so a `gameDataPatch` or `turnStarted` the worker sends straight after `gameData` is never lost), in the order
//  `Renderer` always registered them; a patch that arrives straight after `gameData` is applied; `turnStarted`
//  renders at once rather than next frame; the welcome window opens only for a new game; `clearKeys`, which the
//  choice windows call, reaches the game's active unit controller once there is one; and `pagehide` runs every
//  disposer, the page's first, and leaves the session alone when the page is kept in the back/forward cache.

// Must stay first: the components read `document` as they load.
import './lib/dom';

import { DataPatch } from '../../src/js/UI/types';
import i18next from 'i18next';
import ActiveUnitController from '../../src/js/UI/game/ActiveUnitController';
import GameSession from '../../src/js/UI/game/GameSession';
import {
  observerCityOpener,
  playerCityOpener,
} from '../../src/js/UI/lib/cityOpeners';
import { ObserverState } from '../../src/js/Engine/Observer';
import Portal from '../../src/js/UI/components/Portal';
import { City as CityData } from '../../src/js/UI/types';
import DebugFlags from '../../src/js/UI/debug/DebugFlags';
import HaltedUnits from '../../src/js/UI/lib/haltedUnits';
import Notices from '../../src/js/UI/components/Notices';
import Notifications from '../../src/js/UI/components/Notifications';
import NotificationBar from '../../src/js/UI/app/NotificationBar';
import Transport from '../../src/js/UI/Transport';
import appElements from '../../src/js/UI/app/elements';
import { applyInterface } from '../../src/js/UI/lib/interfaceMode';
import { assetStore } from '../../src/js/UI/AssetStore';
import { ObjectMap, PlainObject } from '../../src/js/UI/lib/reconstituteData';
import { instance as options } from '../../src/js/UI/GameOptionsRegistry';

const failures: string[] = [];
let checks = 0,
  finished = false;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${description}\n    expected: ${JSON.stringify(
        expected
      )}\n    actual:   ${JSON.stringify(actual)}`
    );
  }
};

// A suite that stops before its checks would otherwise pass in silence (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(`FAIL gameSession: stopped after ${checks} checks\n`);
    process.exitCode = 1;
  }
});

// No IndexedDB under node: every picture is its path.
(assetStore as any).get = (path: string) =>
  Promise.resolve({ name: path, uri: path });
(assetStore as any).spriteURL = (path: string) => Promise.resolve(path);

// linkedom's canvas has no context: one that ignores everything.
(globalThis as any).HTMLCanvasElement.prototype.getContext = () =>
  new Proxy({} as { [key: string]: any }, {
    get: (target, name: string) =>
      name in target
        ? target[name]
        : name === 'measureText'
        ? (text: string) => ({ width: String(text).length * 10 })
        : name === 'getImageData'
        ? () => ({ data: new Uint8ClampedArray(4) })
        : () => {},
    set: (target, name: string, value) => {
      target[name] = value;

      return true;
    },
  });

// The map's blink tick, which would otherwise keep node running.
const intervals: number[] = [],
  clearedIntervals: number[] = [];

Object.assign(window, {
  setInterval: () => intervals.push(intervals.length + 1),
  clearInterval: (reference: number) => clearedIntervals.push(reference),
});

// Frames run only when the test says so.
const frames = new Map<number, () => void>(),
  cancelledFrames: number[] = [];
let nextFrame = 1;

Object.assign(globalThis, {
  requestAnimationFrame: (callback: () => void): number => {
    const handle = nextFrame++;

    frames.set(handle, callback);

    return handle;
  },
  cancelAnimationFrame: (handle: number): void => {
    if (frames.delete(handle)) {
      cancelledFrames.push(handle);
    }
  },
});

// The leave guard's history entry.
(globalThis as any).history = { pushState: () => {}, go: () => {} };
(globalThis as any).location = { href: 'http://127.0.0.1/' };

const ref = (id: string) => ({ '#ref': id });

const makeMap = (turn: number): ObjectMap => {
  const objects: ObjectMap['objects'] = {
    'Player-1': {
      _: 'Player',
      id: 'Player-1',
      actions: [],
      cities: [],
      civilization: ref('Civilization-1'),
      government: ref('Government-1'),
      research: ref('Research-1'),
      treasuries: [{ yield: { _: 'Gold' }, value: 30 }],
      units: [],
      world: ref('World-1'),
    },
    'Civilization-1': {
      _: 'Egyptian',
      id: 'Civilization-1',
      attributes: [],
      leader: { _: 'RamessesII' },
    },
    'Government-1': {
      _: 'PlayerGovernment',
      id: 'Government-1',
      current: { _: 'Despotism' },
      anarchyTurns: null,
    },
    'Research-1': {
      _: 'PlayerResearch',
      id: 'Research-1',
      complete: [{ _: 'Alphabet' }],
      cost: { value: 10 },
      progress: { value: 0 },
      researching: null,
    },
    'World-1': {
      _: 'PlayerWorld',
      id: 'World-1',
      width: 2,
      height: 1,
      tiles: [ref('Tile-0'), ref('Tile-1')],
    },
    'Turn-1': { _: 'Turn', id: 'Turn-1', value: turn },
    'Year-1': { _: 'Year', id: 'Year-1', value: -4000 + turn * 20 },
  };

  [0, 1].forEach((x) => {
    objects[`Tile-${x}`] = {
      _: 'PlayerTile',
      id: `Tile-${x}`,
      x,
      y: 0,
      city: null,
      goodyHut: null,
      improvements: [],
      isCoast: false,
      isLand: true,
      isWater: false,
      terrain: { _: 'Unknown', features: [] },
      units: [],
      workedBy: null,
      yields: [],
    };
  });

  return {
    hierarchy: {
      difficulty: null,
      player: ref('Player-1'),
      turn: ref('Turn-1'),
      year: ref('Year-1'),
    },
    objects,
  };
};

const update = (id: string, value: PlainObject): DataPatch => ({
  [id]: { type: 'update', value: { hierarchy: value, objects: {} } },
});

// The worker, by hand: what is registered, in order, what is sent, and which disposers run.
type Handler = (data: any) => void;

const receivers: Array<[string, Handler]> = [],
  disposed: string[] = [],
  sent: Array<[string, unknown]> = [],
  requested: Array<[string, unknown[]]> = [];

const transport = {
  receive: (name: string, handler: Handler) => {
    receivers.push([name, handler]);

    return (): void => {
      disposed.push(name);
    };
  },
  receiveOnce: () => {},
  send: (name: string, data: unknown) => sent.push([name, data]),
  // A request never answered: what was asked is what the checks read.
  request: (request: { channel(): string; args(): unknown[] }) => {
    requested.push([request.channel(), request.args()]);

    return new Promise(() => {});
  },
} as unknown as Transport;

const deliver = (name: string, data?: unknown): void =>
  receivers
    .filter(([receiving]) => receiving === name)
    .forEach(([, handler]) => handler(data));

const run = async (): Promise<void> => {
  await i18next.init({
    lng: 'en',
    resources: {
      en: {
        translation: {
          Game: { waiting: 'Waiting for the other civilizations' },
          GameDetails: { turn: 'Turn {{turn}}' },
          Welcome: {
            'you-have-risen': 'You have risen',
            'your-people-have-knowledge-of': 'Knowledge of {{advances}}',
          },
        },
      },
    },
  });

  document.body.insertAdjacentHTML(
    'beforeend',
    `<div id="mainmenu"></div>
<div id="game">
  <div id="sidebar">
    <canvas id="minimap" width="190"></canvas>
    <div id="gameDetails"></div>
    <div id="playerDetails"></div>
    <section class="sidebar-section" data-section="unit"><div id="unitInfo"></div></section>
  </div>
  <div id="map"><canvas></canvas></div>
  <div id="game-menu"></div>
  <div id="actions"></div>
  <div id="other-actions"></div>
  <div id="unit-actions"></div>
</div>
<div id="notification"></div>`
  );

  const elements = appElements(),
    transportDisposers: Array<() => void> = [
      // The page's own, registered before the game: run first.
      (): void => {
        disposed.push('page');
      },
    ];

  let gameStarted = false;

  const session = new GameSession({
    elements,
    transport,
    notifications: new Notifications(),
    notices: new Notices(),
    haltedUnits: new HaltedUnits(),
    debugFlags: new DebugFlags(false),
    notificationBar: new NotificationBar(elements.notificationArea),
    pendingSave: null,
    cheatsEnabled: false,
    setGameStarted: (): void => {
      gameStarted = true;
    },
    transportDisposers,
  });

  const consoleError = console.error,
    errors: unknown[] = [];

  console.error = (...args: unknown[]) => errors.push(args);

  // What reaches the active unit's controller of the keys `clearKeys` forgets.
  const controllerClearKeys = ActiveUnitController.prototype.clearKeys;
  let keysCleared = 0;

  ActiveUnitController.prototype.clearKeys = function (
    this: ActiveUnitController
  ): void {
    keysCleared++;

    controllerClearKeys.call(this);
  };

  // A choice window can open before any game: there is no controller yet.
  session.clearKeys();

  expect('clearKeys before the game has started does nothing', keysCleared, 0);

  session.start(makeMap(1));

  session.clearKeys();

  expect("clearKeys reaches the game's active unit controller", keysCleared, 1);

  ActiveUnitController.prototype.clearKeys = controllerClearKeys;

  // Synchronously, before anything else runs.
  expect(
    'every game receiver is registered before start returns, in the order Renderer registered them',
    receivers.map(([name]) => name),
    [
      'gameData',
      'actionHandled',
      'turnEnded',
      'turnStarted',
      'gameDataPatch',
      'gameNotification',
      'unitHalted',
      'embassyEstablished',
      'investigateCity',
    ]
  );
  expect(
    "the page's disposers stay first, then the render frame's, the state's and one per receiver",
    transportDisposers.length,
    1 + 3 + 9
  );
  expect('nothing went wrong starting', errors, []);
  expect('the game has started', gameStarted, true);
  expect(
    'the game area is shown',
    elements.gameArea.classList.contains('active'),
    true
  );
  expect(
    'the waiting banner is in the map, empty',
    elements.mapWrapper.querySelector('.waiting')?.textContent,
    ''
  );
  expect(
    'a new game is welcomed',
    document.querySelectorAll('.welcome').length,
    1
  );
  expect(
    'the welcome lists the starting advances and the ones the player has',
    document.querySelector('.welcome p:last-child')?.textContent,
    'Knowledge of Irrigation,Mining,Roads,Alphabet'
  );
  expect(
    'the game menu is built',
    elements.gameMenu.querySelectorAll('button').length,
    1
  );
  expect(
    'the first render waits for a frame',
    elements.gameInfo.textContent,
    ''
  );
  expect('one frame is asked for', frames.size, 1);

  // Queued behind `gameData`: the patch is applied to the map `start` was given.
  deliver('gameDataPatch', [
    update('Turn-1', { _: 'Turn', id: 'Turn-1', value: 2 }),
  ]);

  expect('the patch asks for no second frame', frames.size, 1);

  // `turnStarted` renders now, cancelling the frame.
  deliver('turnStarted');

  expect(
    'turnStarted renders at once, with the patched turn',
    elements.gameInfo.querySelector('.turn')?.textContent,
    'Turn 2'
  );
  expect('and cancels the frame it replaces', cancelledFrames, [1]);
  expect('so no frame is left', frames.size, 0);
  expect(
    "with no unit active, the unit's section is hidden rather than empty",
    (document.querySelector('[data-section="unit"]') as HTMLElement).hidden,
    true
  );

  deliver('turnEnded');

  expect(
    'turnEnded fills the waiting banner',
    elements.mapWrapper.querySelector('.waiting')?.textContent,
    'Waiting for the other civilizations'
  );

  deliver('gameNotification', {
    bubble: true,
    key: 'SomethingHappened',
    data: {},
  });

  expect('a notice asks for a frame', frames.size, 1);

  // A page kept in the back/forward cache comes back as it was.
  const persisted = new Event('pagehide');

  Object.defineProperty(persisted, 'persisted', { value: true });
  window.dispatchEvent(persisted);

  expect('a kept page disposes nothing', disposed, []);

  window.dispatchEvent(new Event('pagehide'));

  expect(
    "pagehide runs every disposer, the page's first, then the game's in the order they were added",
    disposed,
    [
      'page',
      'gameData',
      'actionHandled',
      'turnEnded',
      'turnStarted',
      'gameDataPatch',
      'gameNotification',
      'unitHalted',
      'embassyEstablished',
      'investigateCity',
    ]
  );
  expect('the pending frame is cancelled', frames.size, 0);
  expect("the map's tick is stopped", clearedIntervals.length > 0, true);

  console.error = consoleError;

  expect('nothing went wrong playing', errors, []);

  // A loaded game is not welcomed.
  document.querySelectorAll('.welcome').forEach((welcome) => welcome.remove());

  new GameSession({
    elements,
    transport,
    notifications: new Notifications(),
    notices: new Notices(),
    haltedUnits: new HaltedUnits(),
    debugFlags: new DebugFlags(false),
    notificationBar: new NotificationBar(elements.notificationArea),
    pendingSave: 'a save',
    cheatsEnabled: false,
    setGameStarted: (): void => {},
    transportDisposers: [],
  }).start(makeMap(1));

  expect(
    'a loaded game is not welcomed',
    document.querySelectorAll('.welcome').length,
    0
  );

  // A world on a grid that can't be drawn here (#89): said, and back to the menu, with no game started.
  const alerts: string[] = [];
  let reloads = 0,
    hexStarted = false;

  Object.assign(window, {
    alert: (message: string) => alerts.push(message),
    location: { reload: () => reloads++ },
  });

  const hexMap = makeMap(1),
    receiversBefore = receivers.length;

  Object.assign(hexMap.objects['World-1'], { topologyId: 'hex-odd-r' });

  new GameSession({
    elements,
    transport,
    notifications: new Notifications(),
    notices: new Notices(),
    haltedUnits: new HaltedUnits(),
    debugFlags: new DebugFlags(false),
    notificationBar: new NotificationBar(elements.notificationArea),
    pendingSave: 'a save',
    cheatsEnabled: false,
    setGameStarted: (): void => {
      hexStarted = true;
    },
    transportDisposers: [],
  }).start(hexMap);

  expect(
    'a world on a grid that cannot be drawn is said, and the page goes back to the menu',
    [alerts, reloads],
    [['SavedGame.needs-grid'], 1]
  );
  expect(
    'with no game started and nothing registered',
    [hexStarted, receivers.length - receiversBefore],
    [false, 0]
  );

  // Auto end of turn sends End Turn once, until the worker answers it (#151): the patch that comes with the answer still
  //  has End Turn as the only thing left, and a second one could end the next turn before it started.
  receivers.splice(0);
  sent.splice(0);
  options.set('autoEndOfTurn', true);

  const endTurnMap = makeMap(1),
    endTurns = (): number =>
      sent.filter(
        ([name, data]) => name === 'action' && (data as any)?.name === 'EndTurn'
      ).length;

  Object.assign(endTurnMap.objects['Player-1'], {
    actions: [ref('EndTurn-1')],
    mandatoryActions: [ref('EndTurn-1')],
  });
  endTurnMap.objects['EndTurn-1'] = { _: 'EndTurn', id: 'EndTurn-1' };

  new GameSession({
    elements,
    transport,
    notifications: new Notifications(),
    notices: new Notices(),
    haltedUnits: new HaltedUnits(),
    debugFlags: new DebugFlags(false),
    notificationBar: new NotificationBar(elements.notificationArea),
    pendingSave: 'a save',
    cheatsEnabled: false,
    setGameStarted: (): void => {},
    transportDisposers: [],
  }).start(endTurnMap);

  expect('with only End Turn left, the turn is ended', endTurns(), 1);

  deliver('gameDataPatch', [
    update('Turn-1', { _: 'Turn', id: 'Turn-1', value: 1 }),
  ]);

  expect('the patch before its answer sends no second End Turn', endTurns(), 1);

  // Refused, as while talks are open (#491), in the order the worker sends it: the patch, the answer, then one more
  //  patch, which ends the turn again.
  deliver('gameDataPatch', [
    update('Turn-1', { _: 'Turn', id: 'Turn-1', value: 1 }),
  ]);
  deliver('actionHandled', { name: 'EndTurn' });

  expect('the answer alone sends nothing', endTurns(), 1);

  deliver('gameDataPatch', []);

  expect(
    'the patch after a refused End Turn ends the turn again',
    endTurns(),
    2
  );

  // Accepted: the patch, the answer and `turnEnded`.
  deliver('gameDataPatch', [
    update('Turn-1', { _: 'Turn', id: 'Turn-1', value: 2 }),
  ]);
  deliver('actionHandled', { name: 'EndTurn' });
  deliver('turnEnded');
  deliver('gameDataPatch', [
    update('Turn-1', { _: 'Turn', id: 'Turn-1', value: 2 }),
  ]);

  expect('not while waiting for the other civilizations', endTurns(), 2);

  deliver('turnStarted');

  expect('the next turn, with only End Turn left, is ended', endTurns(), 3);

  // That End Turn is never answered, as when it reached the worker before the turn was handed over: the next turn
  //  starts all the same, and is ended (#151).
  deliver('turnEnded');
  deliver('turnStarted');

  expect(
    'an End Turn never answered does not stop the next turn being ended',
    endTurns(),
    4
  );

  options.set('autoEndOfTurn', false);

  // A watcher's notices (#607, #613): no End Turn clears them, so a turn's are kept until the turn after it has come,
  //  and a change of view, which sends a whole game's data, clears them all.
  receivers.splice(0);
  sent.splice(0);

  const watcherNotices = new Notices(),
    noticesShown = (): number =>
      watcherNotices.actions({
        player: { cities: [], civilization: null },
      } as any).length;

  new GameSession({
    elements,
    transport,
    notifications: new Notifications(),
    notices: watcherNotices,
    haltedUnits: new HaltedUnits(),
    debugFlags: new DebugFlags(false),
    notificationBar: new NotificationBar(elements.notificationArea),
    pendingSave: null,
    cheatsEnabled: false,
    setGameStarted: (): void => {},
    transportDisposers: [],
    observer: () => ({
      players: [
        { id: 'Player-1', civilization: 'Egyptian', leader: 'RamessesII' },
      ],
      view: { kind: 'players', playerIds: ['Player-1'] },
      paused: false,
    }),
  }).start(makeMap(1));

  deliver('gameNotification', {
    bubble: true,
    key: 'SomethingHappened',
    data: {},
  });
  deliver('gameDataPatch', [
    update('Turn-1', { _: 'Turn', id: 'Turn-1', value: 1 }),
  ]);

  expect(
    'a watcher keeps a notice through the turn it came in',
    noticesShown(),
    1
  );

  // The turn's data comes after what it told of: the notice stays for that turn, and goes with the next.
  deliver('gameDataPatch', [
    update('Turn-1', { _: 'Turn', id: 'Turn-1', value: 2 }),
  ]);

  expect(
    "the turn's own data arriving keeps the notice, for the pause between turns",
    noticesShown(),
    1
  );

  deliver('gameNotification', {
    bubble: true,
    key: 'SomethingElse',
    data: {},
  });
  deliver('gameDataPatch', [
    update('Turn-1', { _: 'Turn', id: 'Turn-1', value: 3 }),
  ]);

  expect(
    "the next turn's data drops the earlier turn's notice and keeps its own",
    noticesShown(),
    1
  );

  deliver('gameData', makeMap(3));

  expect(
    "a change of view, which sends a whole game's data, clears them all",
    noticesShown(),
    0
  );

  // How a city opens (#613): a player's own from the page's data, a watcher's by asking the worker for it, when it is
  //  a civilisation watched's, or any city of the whole map.
  const portalFor = (playerId: string): Portal =>
      ({
        playerId: () => playerId,
        transport: () => transport,
      } as unknown as Portal),
    cityOf = (playerId: string): CityData =>
      ({
        id: `City-${playerId}`,
        player: { id: playerId },
        tile: { x: 3, y: 4 },
      } as unknown as CityData),
    watching = (view: ObserverState['view']) =>
      observerCityOpener(transport, () => ({
        players: [],
        view,
        paused: false,
      }));

  expect(
    'a player opens their own cities and no others',
    [
      playerCityOpener().opens(cityOf('Player-1'), portalFor('Player-1')),
      playerCityOpener().opens(cityOf('Player-2'), portalFor('Player-1')),
    ],
    [true, false]
  );
  expect(
    "a watcher opens the watched civilisations' cities and no others",
    [
      watching({ kind: 'players', playerIds: ['Player-1'] }).opens(
        cityOf('Player-1'),
        portalFor('Player-1')
      ),
      watching({ kind: 'players', playerIds: ['Player-1'] }).opens(
        cityOf('Player-2'),
        portalFor('Player-1')
      ),
      watching({ kind: 'world' }).opens(
        cityOf('Player-2'),
        portalFor('Player-1')
      ),
    ],
    [true, false, true]
  );

  watching({ kind: 'world' }).open(cityOf('Player-2'), portalFor('Player-1'));

  expect(
    'a watcher opening a city asks the worker for the city on its square',
    requested,
    [['observeCity', [{ x: 3, y: 4 }]]]
  );

  // The active unit's card (#743): the classic one and the strip at the bottom left, or under the new interface the
  //  card with the unit's actions in it, and no strip.
  expect(
    'the classic interface keeps the classic card and the actions strip',
    [
      document.getElementById('unitInfo')?.classList.contains('ui-unit-card'),
      document.getElementById('unit-actions') !== null,
    ],
    [false, true]
  );

  applyInterface('new', null);

  new GameSession({
    elements,
    transport,
    notifications: new Notifications(),
    notices: new Notices(),
    haltedUnits: new HaltedUnits(),
    debugFlags: new DebugFlags(false),
    notificationBar: new NotificationBar(elements.notificationArea),
    pendingSave: 'a save',
    cheatsEnabled: false,
    setGameStarted: (): void => {},
    transportDisposers: [],
  }).start(makeMap(1));

  expect(
    'the new interface puts the actions in the card, and the strip goes',
    [
      document.getElementById('unitInfo')?.classList.contains('ui-unit-card'),
      document.querySelectorAll('#unitInfo > .ui-unit-card-actions').length,
      document.getElementById('unit-actions'),
    ],
    [true, 1, null]
  );

  applyInterface('classic', null);

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL gameSession: ${
        failures.length
      } of ${checks} checks\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS gameSession: ${checks} checks\n`);
  process.exit(0);
};

run().catch((error) => {
  process.stderr.write(`FAIL gameSession: ${error.stack ?? error}\n`);
  process.exit(1);
});
