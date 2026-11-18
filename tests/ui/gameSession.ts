// One game's start, out of `Renderer.ts` (#344): `GameSession#start` registers every game receiver before it returns
//  (so a `gameDataPatch` or `turnStarted` the worker sends straight after `gameData` is never lost), in the order
//  `Renderer` always registered them; a patch that arrives straight after `gameData` is applied; `turnStarted`
//  renders at once rather than next frame; the welcome window opens only for a new game; `clearKeys`, which the
//  choice windows call, reaches the game's active unit controller once there is one; and `pagehide` runs every
//  disposer, the page's first, and leaves the session alone when the page is kept in the back/forward cache.

// Must stay first: the components read `document` as they load.
import './lib/dom';
import './lib/interfaces';
import './lib/classicInterface';
import './lib/grids';
import './lib/artPacks';

import {
  canHandOverGame,
  handOverGame,
} from '@civ-clone/ui-client/lib/gameHandOver';
import {
  chooseMapTileset,
  installTilesets,
} from '@civ-clone/ui-assets/lib/tilesets';
import { DataPatch } from '@civ-clone/ui-protocol/types';
import i18next from 'i18next';
import ActiveUnitController from '@civ-clone/ui-game/ActiveUnitController';
import GameSession from '@civ-clone/ui-game/GameSession';
import {
  observerCityOpener,
  playerCityOpener,
} from '@civ-clone/ui-hud/lib/cityOpeners';
import { ObserverState } from '@civ-clone/ui-protocol/observer';
import Portal from '@civ-clone/ui-map/components/Portal';
import { City as CityData, Tile } from '@civ-clone/ui-protocol/types';
import { MapView2D } from '@civ-clone/ui-game/MapView2D';
import DebugFlags from '@civ-clone/ui-client/debug/DebugFlags';
import HaltedUnits from '@civ-clone/ui-client/lib/haltedUnits';
import Notices from '@civ-clone/ui-hud/components/Notices';
import Notifications from '@civ-clone/ui-hud/components/Notifications';
import NotificationBar from '@civ-clone/ui-game/app/NotificationBar';
import Transport from '@civ-clone/ui-client/Transport';
import { PlayerTradeRates } from '@civ-clone/ui-protocol/types';
import { openTradeRates } from '@civ-clone/ui-hud/components/Actions/AdjustTradeRates';
import appElements from '@civ-clone/ui-game/app/elements';
import { applyInterface } from '@civ-clone/ui-platform/lib/interfaceMode';
import { assetStore } from '@civ-clone/ui-assets/AssetStore';
import { ObjectMap, PlainObject } from '@civ-clone/core-data-object/DataObject';
import { instance as options } from '@civ-clone/ui-platform/GameOptionsRegistry';

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

const makeMap = (
  turn: number,
  unitOnTile: number | null = null,
  cityOnTile: number | null = null
): ObjectMap => {
  const objects: ObjectMap['objects'] = {
    'Player-1': {
      _: 'Player',
      id: 'Player-1',
      actions: [],
      cities: cityOnTile === null ? [] : [ref('City-1')],
      civilization: ref('Civilization-1'),
      government: ref('Government-1'),
      research: ref('Research-1'),
      treasuries: [{ yield: { _: 'Gold' }, value: 30 }],
      units: unitOnTile === null ? [] : [ref('Unit-1')],
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

  if (cityOnTile !== null) {
    objects['City-1'] = {
      _: 'City',
      id: 'City-1',
      name: 'Thebes',
      build: { building: null, cost: { value: 0 }, progress: { value: 0 } },
      growth: { size: 1, cost: { value: 20 }, progress: { value: 0 } },
      improvements: [],
      specialists: [],
      yields: [],
      player: ref('Player-1'),
      tile: ref(`Tile-${cityOnTile}`),
    };
  }

  if (unitOnTile !== null) {
    objects['Unit-1'] = {
      _: 'Settlers',
      id: 'Unit-1',
      actions: [],
      city: null,
      player: ref('Player-1'),
      tile: ref(`Tile-${unitOnTile}`),
    };
  }

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
          Game: {
            waiting: 'Waiting for the other civilizations',
            'carrying-over': 'Carrying the game over',
          },
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
      'notification',
      'turnEnded',
      'turnStarted',
      'gameDataPatch',
      'gameNotification',
      'battle',
      'mapEvent',
      'unitHalted',
      'embassyEstablished',
      'investigateCity',
      'handOverGame',
      'saveFailed',
    ]
  );
  expect(
    "the page's disposers stay first, then the render frame's, the state's, one per receiver, the unit panel's, and the map's art's and the hand-over's, and the trade rates window's close (#1058)",
    transportDisposers.length,
    1 + 3 + 14 + 1 + 2 + 1
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

  // The map's art chosen again during the game (#1118): the map is drawn with it at once, and again as it goes back.
  {
    const { redrawArt } = MapView2D.prototype,
      redrawn: string[] = [];

    MapView2D.prototype.redrawArt = function (
      this: MapView2D
    ): ReturnType<typeof redrawArt> {
      const result = redrawArt.call(this);

      redrawn.push(result);

      return result;
    };

    installTilesets({});
    chooseMapTileset('square', 'civ1-pixelart');
    // Not the grid's art: nothing to redraw.
    options.set('autosave', '5');
    chooseMapTileset('square', '');

    MapView2D.prototype.redrawArt = redrawArt;
    // Civ1's alone again, as the rest expects: no hex art to draw a hex world with.
    installTilesets({
      'civ1-pixelart': { complete: false, metadata: null },
      'hex-pixelart': { complete: false, metadata: null },
    });

    expect(
      "choosing the grid's art draws the map with it, and choosing back again",
      redrawn,
      ['redrawn', 'redrawn']
    );
  }

  // The game carried over to a new page (#1118), for a theme's new interface art: saved for the page that replaces
  //  this one, once at a time, and again once a save has failed.
  {
    const before = sent.length;

    expect(
      "a game of the player's own can be handed over, once at a time",
      [canHandOverGame(), handOverGame(), handOverGame()],
      [true, true, false]
    );
    expect(
      "saved for the hand-over, not as a save of the player's",
      sent.slice(before),
      [['save', { name: 'hand-over', handOver: true }]]
    );

    const banner = (): string | null | undefined =>
      elements.mapWrapper.querySelector('.waiting')?.textContent;

    expect(
      'and the game waits while it is, as anything done now would be lost with the page',
      [banner(), handOverGame()],
      ['Carrying the game over', false]
    );

    // The player's own save failing while the hand-over's is on its way doesn't hand the game back.
    deliver('saveFailed', { message: "the player's" });

    expect(
      "the player's own save failing leaves the hand-over waiting",
      banner(),
      'Carrying the game over'
    );

    deliver('saveFailed', { message: 'full', handOver: true });

    expect(
      'a save that failed hands the game back, to try again',
      [banner(), handOverGame()],
      ['', true]
    );

    deliver('saveFailed', { message: 'full', handOver: true });
  }

  // Art whose units and cities stack the other way from the layers built needs a new page (#1144): the game is carried
  //  over to one, or, where it can't be now, the player is told the art waits for the next load. The save comes back
  //  on `handOverGame` to be handed over (`handOverSave`): where it can't be, that's said and the game goes on.
  {
    const { redrawArt } = MapView2D.prototype,
      { alert } = window,
      alerted: string[] = [],
      banner = (): string | null | undefined =>
        elements.mapWrapper.querySelector('.waiting')?.textContent,
      before = sent.length;

    MapView2D.prototype.redrawArt = (): ReturnType<typeof redrawArt> =>
      'reload';
    window.alert = (message: string): void => {
      alerted.push(message);
    };

    chooseMapTileset('square', 'civ1-pixelart');

    const carried = sent.slice(before);

    elements.notificationArea.textContent = '';
    // Being carried over already: this one waits.
    chooseMapTileset('square', '');

    const said = elements.notificationArea.textContent;

    // Storage that refuses: the stand-in's never answers.
    const { indexedDB } = globalThis as { indexedDB?: unknown };

    (globalThis as { indexedDB?: unknown }).indexedDB = {
      open: (): never => {
        throw new Error('blocked');
      },
    };

    deliver('handOverGame', { data: 'a save' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    (globalThis as { indexedDB?: unknown }).indexedDB = indexedDB;

    // The refusal is logged as the game is handed back: expected here.
    const logged = errors.splice(0);

    expect(
      "art that needs a new page carries the game over to one, and where it can't be now, says the art waits for the next load; a hand-over that can't be stored is said, and the game handed back",
      [carried, said, alerted, logged.length, banner(), handOverGame()],
      [
        [['save', { name: 'hand-over', handOver: true }]],
        'Game.art-next-load',
        ['SavedGame.could-not-carry-over'],
        1,
        '',
        true,
      ]
    );

    deliver('saveFailed', { message: 'full', handOver: true });
    MapView2D.prototype.redrawArt = redrawArt;
    window.alert = alert;
  }

  deliver('turnEnded');

  expect(
    'nothing is handed over while the other civilizations move',
    handOverGame(),
    false
  );

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
      'notification',
      'turnEnded',
      'turnStarted',
      'gameDataPatch',
      'gameNotification',
      'battle',
      'mapEvent',
      'unitHalted',
      'embassyEstablished',
      'investigateCity',
      'handOverGame',
      'saveFailed',
    ]
  );
  expect('the pending frame is cancelled', frames.size, 0);
  expect('and there is no game to hand over', canHandOverGame(), false);
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

  // A new game opens on the player's start, once (#705), and a loaded one where it is.
  const mapViewCentre = MapView2D.prototype.centre,
    centred: string[] = [],
    startWith = (
      pendingSave: string | null,
      cityOnTile: number | null = null
    ): void => {
      receivers.splice(0);
      centred.length = 0;

      new GameSession({
        elements,
        transport,
        notifications: new Notifications(),
        notices: new Notices(),
        haltedUnits: new HaltedUnits(),
        debugFlags: new DebugFlags(false),
        notificationBar: new NotificationBar(elements.notificationArea),
        pendingSave,
        cheatsEnabled: false,
        setGameStarted: (): void => {},
        transportDisposers: [],
      }).start(makeMap(1, 1, cityOnTile));
    };

  MapView2D.prototype.centre = function (this: MapView2D, tile: Tile): void {
    centred.push(`${tile.x},${tile.y}`);
  };

  startWith(null);

  expect('the map waits for the first turn', centred, []);

  deliver('turnStarted');

  expect("a new game's first turn centres on the start", centred, ['1,0']);

  deliver('turnEnded');
  deliver('turnStarted');

  expect('and no later turn does', centred, ['1,0']);

  // A loaded one on the player's first city, or with none their first unit, rather than the map's corner (#826).
  startWith('a save', 0);
  deliver('turnStarted');

  expect("a loaded game opens on the player's first city", centred, ['0,0']);

  deliver('turnEnded');
  deliver('turnStarted');

  expect('and only on its first turn', centred, ['0,0']);

  startWith('a save');
  deliver('turnStarted');

  expect('a loaded game with no city opens on the first unit', centred, [
    '1,0',
  ]);

  MapView2D.prototype.centre = mapViewCentre;
  document.querySelectorAll('.welcome').forEach((welcome) => welcome.remove());

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

  // The trade rates window holds the turn while it's open, and while rates it sent are unanswered: the figures until the
  //  answer are from before them, and moving them may have cleared the disorder that held the turn (#1058).
  deliver('turnEnded');

  const ratesWindow = openTradeRates(
    {
      id: 'PlayerTradeRates-1',
      all: [
        { _: 'Tax', value: 40 },
        { _: 'Luxuries', value: 0 },
        { _: 'Research', value: 60 },
      ],
    } as unknown as PlayerTradeRates,
    transport
  );

  deliver('turnStarted');

  expect('not while the trade rates window is open', endTurns(), 4);

  const luxuries = ratesWindow
    .element()
    .querySelectorAll('input[type="number"]')[1] as HTMLInputElement;

  luxuries.value = '20';
  luxuries.dispatchEvent(new Event('input'));
  (
    ratesWindow.element().querySelector('footer .btn-primary') as HTMLElement
  ).click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(
    'nor once it closes, while the rates it sent are unanswered',
    endTurns(),
    4
  );

  deliver('gameDataPatch', []);

  expect('nor on a patch before their answer', endTurns(), 4);

  deliver('actionHandled', { name: 'AdjustTradeRates' });

  expect('once they are answered, the turn is ended', endTurns(), 5);

  // That End Turn is on its way: a trade rates window opened now holds its moves rather than send them after it, and
  //  sends them once End Turn is refused and the turn goes on (#1169).
  const rateSends = (): number =>
      sent.filter(
        ([name, data]) =>
          name === 'action' && (data as any)?.name === 'AdjustTradeRates'
      ).length,
    rateSendsBefore = rateSends(),
    gapWindow = openTradeRates(
      {
        id: 'PlayerTradeRates-1',
        all: [
          { _: 'Tax', value: 40 },
          { _: 'Luxuries', value: 20 },
          { _: 'Research', value: 40 },
        ],
      } as unknown as PlayerTradeRates,
      transport
    ),
    gapTax = gapWindow
      .element()
      .querySelector('input[type="number"]') as HTMLInputElement;

  gapTax.value = '10';
  gapTax.dispatchEvent(new Event('input'));
  await new Promise((resolve) => setTimeout(resolve, 250));

  const heldWhileEnding = rateSends() - rateSendsBefore;

  deliver('actionHandled', { name: 'EndTurn' });
  await new Promise((resolve) => setTimeout(resolve, 250));

  expect(
    'a window opened while End Turn is on its way holds its moves, and sends them once it is refused',
    [heldWhileEnding, rateSends() - rateSendsBefore],
    [0, 1]
  );

  // Tidied away for what follows.
  deliver('gameDataPatch', []);
  deliver('actionHandled', { name: 'AdjustTradeRates' });
  (
    gapWindow.element().querySelector('footer .btn-primary') as HTMLElement
  ).click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  deliver('turnEnded');

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

  applyInterface('modern', null);

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
