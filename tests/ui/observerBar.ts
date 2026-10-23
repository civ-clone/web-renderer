// Watching a game nobody here plays (#607, #613), with the real components built under linkedom: the bar offers the
//  whole map or the civilizations, with a checkbox per player ticked as `view` says, and its radios, checkboxes and
//  button send `observe`, `pause` and `resume` (the last tick can't be cleared); an `update` redraws it from the new
//  state (Play and "paused" when held, a player gone, the whole map); a watched game's ending records no Hall of Fame
//  entry and offers no Keep playing; and a `GameSession` given an observer skips the welcome and the leave guard, draws
//  the bar in the map, redraws it and shows or hides the player's panel on the worker's `observer`, and waits with
//  `Observer.watching`.

// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';

import { DataPatch } from '../../src/js/UI/types';
import { GameOverDetails } from '../../src/js/Engine/lib/gameOver';
import { ObjectMap } from '../../src/js/UI/lib/reconstituteData';
import { ObserverState } from '../../src/js/Engine/Observer';
import i18next from 'i18next';
import DebugFlags from '../../src/js/UI/debug/DebugFlags';
import GameOverWindow from '../../src/js/UI/components/GameOverWindow';
import GameSession from '../../src/js/UI/game/GameSession';
import HaltedUnits from '../../src/js/UI/lib/haltedUnits';
import NotificationBar from '../../src/js/UI/app/NotificationBar';
import Notices from '../../src/js/UI/components/Notices';
import Notifications from '../../src/js/UI/components/Notifications';
import ObserverBar from '../../src/js/UI/components/ObserverBar';
import Transport from '../../src/js/UI/Transport';
import appElements from '../../src/js/UI/app/elements';
import { assetStore } from '../../src/js/UI/AssetStore';
import { hallOfFame } from '../../src/js/UI/lib/hallOfFame';

const failures: string[] = [];
let checks = 0,
  finished = false;

// A suite that stops before its checks would otherwise exit 0 (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      `FAIL observerBar: stopped after ${checks} checks, before the end\n`
    );
    process.exitCode = 1;
  }
});

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

// No IndexedDB under node: every picture is its path.
(assetStore as any).get = (path: string) =>
  Promise.resolve({ name: path, uri: path });

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
Object.assign(window, {
  setInterval: () => 1,
  clearInterval: () => {},
});

// Frames run only when the test says so (they never do here).
Object.assign(globalThis, {
  requestAnimationFrame: () => 1,
  cancelAnimationFrame: () => {},
});

// The leave guard's history entry: `guardLeaving` pushes one, so a push means the game is guarded.
let historyPushes = 0;

(globalThis as any).history = {
  pushState: () => {
    historyPushes++;
  },
  go: () => {},
};
(globalThis as any).location = { href: 'http://127.0.0.1/' };

// The Hall of Fame's storage.
const stored: { [key: string]: string } = {};

(globalThis as any).localStorage = {
  getItem: (key: string) => stored[key] ?? null,
  setItem: (key: string, value: string) => {
    stored[key] = value;
  },
};

// The worker, by hand: what is sent, and what is registered to be received.
type Handler = (data: any) => void;

const sent: Array<[string, unknown]> = [],
  receivers: Array<[string, Handler]> = [];

const transport = {
    receive: (name: string, handler: Handler) => {
      receivers.push([name, handler]);

      return (): void => {};
    },
    receiveOnce: () => {},
    send: (name: string, data: unknown) => sent.push([name, data]),
  } as unknown as Transport,
  deliver = (name: string, data?: unknown): void =>
    receivers
      .filter(([receiving]) => receiving === name)
      .forEach(([, handler]) => handler(data));

const players = [
    { id: 'Player-1', civilization: 'Roman', leader: 'Caesar' },
    { id: 'Player-2', civilization: 'Egyptian', leader: 'RamessesII' },
    { id: 'Player-3', civilization: 'Zulu', leader: null },
  ],
  state = (overrides: Partial<ObserverState> = {}): ObserverState => ({
    players,
    view: { kind: 'players', playerIds: ['Player-1'] },
    paused: false,
    ...overrides,
  }),
  world = { kind: 'world' } as const,
  watching = (...playerIds: string[]) =>
    ({ kind: 'players', playerIds } as const);

// linkedom reflects `checked` inconsistently, and the bar sets both the property and the attribute: read the attribute,
//  and set both as a click would.
const radios = (bar: HTMLElement): HTMLInputElement[] =>
    [
      ...bar.querySelectorAll('input[name="observe-kind"]'),
    ] as HTMLInputElement[],
  boxes = (bar: HTMLElement): HTMLInputElement[] =>
    [
      ...bar.querySelectorAll('input[name="observe-player"]'),
    ] as HTMLInputElement[],
  radio = (bar: HTMLElement, kind: string): HTMLInputElement =>
    radios(bar).find((input) => input.value === kind) as HTMLInputElement,
  // Which kind of view is chosen.
  kind = (bar: HTMLElement): string[] =>
    radios(bar)
      .filter((input) => input.hasAttribute('checked'))
      .map((input) => input.value),
  // Which civilizations are ticked.
  checked = (bar: HTMLElement): string[] =>
    boxes(bar)
      .filter((box) => box.hasAttribute('checked'))
      .map((box) => box.value),
  // The property, as the bar reads it.
  ticked = (bar: HTMLElement): string[] =>
    boxes(bar)
      .filter((box) => box.checked)
      .map((box) => box.value),
  tick = (box: HTMLInputElement, on: boolean): void => {
    box.checked = on;

    if (on) {
      box.setAttribute('checked', '');
    } else {
      box.removeAttribute('checked');
    }

    box.dispatchEvent(new Event('change'));
  },
  choose = (input: HTMLInputElement): void => {
    input.checked = true;
    input.setAttribute('checked', '');
    input.dispatchEvent(new Event('change'));
  },
  labels = (bar: HTMLElement): string[] =>
    [...bar.querySelectorAll('label')].map((label) => label.textContent ?? ''),
  button = (bar: HTMLElement): HTMLButtonElement =>
    bar.querySelector('button.pace') as HTMLButtonElement,
  status = (bar: HTMLElement): string =>
    bar.querySelector('.status')?.textContent ?? '',
  buttonTexts = (): string[] =>
    [...document.querySelectorAll('dialog.window button')].map(
      (element) => element.textContent ?? ''
    );

const details = (
  overrides: Partial<GameOverDetails> = {}
): GameOverDetails => ({
  id: 'GameResult-1',
  reason: 'retired',
  you: { civilization: 'Roman', leader: 'Caesar' },
  winner: null,
  turn: 300,
  year: 1850,
  difficulty: 'Prince',
  score: { terms: [], bonus: null, total: 500, scoringComplete: false },
  rating: 30,
  famousLeader: null,
  discovery: null,
  scoringComplete: false,
  keepPlaying: true,
  ...overrides,
});

const ref = (id: string) => ({ '#ref': id });

// A one-player, two-tile world, as `tests/ui/gameSession.ts` builds one.
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

// The game's markup, fresh for each session.
const mount = (): ReturnType<typeof appElements> => {
  document.body
    .querySelectorAll(':scope > :not(#preload)')
    .forEach((element) => element.remove());

  document.body.insertAdjacentHTML(
    'beforeend',
    `<div id="mainmenu"></div>
<div id="game">
  <div id="sidebar">
    <canvas id="minimap" width="190"></canvas>
    <div id="gameDetails"></div>
    <div id="playerDetails"></div>
    <div id="unitInfo"></div>
  </div>
  <div id="map"><canvas></canvas></div>
  <div id="game-menu"></div>
  <div id="actions"></div>
  <div id="other-actions"></div>
  <div id="unit-actions"></div>
</div>
<div id="notification"></div>`
  );

  return appElements();
};

const playerInfo = (): HTMLElement =>
  document.getElementById('playerDetails') as HTMLElement;

const startSession = (observer?: () => ObserverState | null): void => {
  const elements = mount();

  receivers.splice(0);
  document.querySelectorAll('.welcome').forEach((welcome) => welcome.remove());

  new GameSession({
    elements,
    transport,
    notifications: new Notifications(),
    notices: new Notices(),
    haltedUnits: new HaltedUnits(),
    debugFlags: new DebugFlags(false),
    notificationBar: new NotificationBar(elements.notificationArea),
    pendingSave: null,
    cheatsEnabled: false,
    ...(observer === undefined ? {} : { observer }),
    setGameStarted: (): void => {},
    transportDisposers: [],
  }).start(makeMap(1));
};

const run = async (): Promise<void> => {
  // Not `cimode`, which answers every key with the key itself and so can't show a civilization in a label: the
  //  strings the bar reads, and the civilizations' names left to their defaults.
  await i18next.init({
    lng: 'en',
    resources: {
      en: {
        translation: {
          Game: { waiting: 'Waiting for the other civilizations' },
          GameDetails: { turn: 'Turn {{turn}}' },
          GameOver: {
            'keep-playing': 'Keep playing',
            'main-menu': 'Main menu',
            retired: {
              title: 'Retired',
              body: 'Retired {{year}}',
            },
          },
          Observer: {
            pause: 'Pause',
            paused: 'Paused',
            play: 'Play',
            civilizations: 'Civilizations',
            player: '{{civilization}} ({{leader}})',
            'player_no-leader': '{{civilization}}',
            title: 'Observer',
            'view-as': 'View as',
            watching: 'Watching',
            'whole-map': 'Whole map',
          },
          Welcome: {
            'you-have-risen': 'You have risen',
            'your-people-have-knowledge-of': 'Knowledge of {{advances}}',
          },
        },
      },
    },
  });

  // The bar.
  const parent = document.createElement('div');

  document.body.append(parent);

  const bar = new ObserverBar(parent, transport, state()),
    element = bar.element();

  expect(
    'the bar is added to its parent',
    parent.querySelectorAll('div.observer-bar').length,
    1
  );
  expect(
    'the bar knows its element',
    element.classList.contains('observer-bar'),
    true
  );
  expect(
    'there are two kinds of view, in one group',
    radios(element).map((input) => [input.name, input.value]),
    [
      ['observe-kind', 'world'],
      ['observe-kind', 'players'],
    ]
  );
  expect(
    'the kinds are in a fieldset for the view',
    element.querySelectorAll('fieldset.view input[name="observe-kind"]').length,
    2
  );
  expect(
    'there is a checkbox for each player',
    boxes(element).map((box) => [box.type, box.name, box.value]),
    [
      ['checkbox', 'observe-player', 'Player-1'],
      ['checkbox', 'observe-player', 'Player-2'],
      ['checkbox', 'observe-player', 'Player-3'],
    ]
  );
  expect('the civilizations kind is chosen', kind(element), ['players']);
  expect('and as a property too', radio(element, 'players').checked, true);
  expect('the viewed player is checked', checked(element), ['Player-1']);
  expect('and as a property too', ticked(element), ['Player-1']);
  expect(
    'the kinds are labelled, then each player with its civilization and leader, a leaderless one with its civilization alone',
    labels(element),
    [
      'Whole map',
      'Civilizations',
      'Roman (Caesar)',
      'Egyptian (RamessesII)',
      'Zulu',
    ]
  );
  expect(
    'each label is for its input',
    [...element.querySelectorAll('label')].map((label) =>
      [...element.querySelectorAll('input')].some(
        (input) => input.id === label.getAttribute('for')
      )
    ),
    [true, true, true, true, true]
  );
  expect('the button reads Pause', button(element).textContent, 'Pause');
  expect('nothing is said of being paused', status(element), '');

  // Choosing the whole map.
  choose(radio(element, 'world'));

  expect('choosing the whole map sends observe for the world', sent, [
    ['observe', { view: { kind: 'world' } }],
  ]);

  sent.splice(0);

  // Ticking another civilization to see it too.
  tick(boxes(element)[1], true);

  expect('ticking a player sends every player ticked', sent, [
    [
      'observe',
      { view: { kind: 'players', playerIds: ['Player-1', 'Player-2'] } },
    ],
  ]);

  sent.splice(0);

  tick(boxes(element)[0], false);

  expect('unticking one sends the ones left', sent, [
    ['observe', { view: { kind: 'players', playerIds: ['Player-2'] } }],
  ]);

  sent.splice(0);

  // The last tick can't be cleared: it is ticked again and nothing is sent.
  tick(boxes(element)[1], false);

  expect('unticking the last one sends nothing', sent, []);
  expect('and leaves it ticked', ticked(element), ['Player-2']);

  sent.splice(0);

  // Back to the civilizations with none ticked: the first player's.
  bar.update(state({ view: world }));
  boxes(element).forEach((box) => {
    box.checked = false;
    box.removeAttribute('checked');
  });
  choose(radio(element, 'players'));

  expect(
    'choosing the civilizations with nobody ticked sends the first player',
    sent,
    [['observe', { view: { kind: 'players', playerIds: ['Player-1'] } }]]
  );

  sent.splice(0);

  // Choosing the civilizations again with some ticked sends them all.
  bar.update(state({ view: watching('Player-2', 'Player-3') }));
  choose(radio(element, 'players'));

  expect('choosing the civilizations sends the ones ticked', sent, [
    [
      'observe',
      { view: { kind: 'players', playerIds: ['Player-2', 'Player-3'] } },
    ],
  ]);

  sent.splice(0);

  button(element).dispatchEvent(new Event('click'));

  expect('the button sends pause', sent, [['pause', null]]);

  sent.splice(0);

  // Held between turns, and the worker saying who is now viewed.
  bar.update(state({ paused: true, view: watching('Player-2') }));

  expect('an update redraws who is viewed', checked(element), ['Player-2']);
  expect('as a property too', ticked(element), ['Player-2']);
  expect('with the civilizations kind chosen', kind(element), ['players']);
  expect('the button now reads Play', button(element).textContent, 'Play');
  expect('and says it is paused', status(element), 'Paused');

  button(element).dispatchEvent(new Event('click'));

  expect('the button sends resume', sent, [['resume', null]]);

  sent.splice(0);

  // The pace with no change of view sends nothing, and a change comes from the redrawn checkboxes.
  tick(boxes(element)[2], true);

  expect('the redrawn checkboxes send for their own players', sent, [
    [
      'observe',
      { view: { kind: 'players', playerIds: ['Player-2', 'Player-3'] } },
    ],
  ]);

  sent.splice(0);

  bar.update(state({ paused: false, view: watching('Player-2') }));

  expect(
    'letting the turns go again reads Pause with nothing said',
    [button(element).textContent, status(element)],
    ['Pause', '']
  );

  button(element).dispatchEvent(new Event('click'));

  expect('and the button pauses again', sent, [['pause', null]]);

  sent.splice(0);

  // A player gone.
  bar.update(state({ players: players.slice(0, 2) }));

  expect(
    'a player removed leaves their checkbox out',
    boxes(element).map((box) => box.value),
    ['Player-1', 'Player-2']
  );
  expect('with their label', labels(element), [
    'Whole map',
    'Civilizations',
    'Roman (Caesar)',
    'Egyptian (RamessesII)',
  ]);
  expect('and the view redrawn', checked(element), ['Player-1']);
  expect(
    'and one bar still',
    parent.querySelectorAll('div.observer-bar').length,
    1
  );
  expect(
    'with one button and one status',
    [
      element.querySelectorAll('button').length,
      element.querySelectorAll('.status').length,
    ],
    [1, 1]
  );

  // Several together, and the whole map.
  bar.update(state({ view: watching('Player-1', 'Player-2') }));

  expect('several viewed together are all ticked', checked(element), [
    'Player-1',
    'Player-2',
  ]);

  const kept = boxes(element);

  bar.update(state({ view: watching('Player-2') }));

  expect(
    'a change of view alone keeps the same checkboxes',
    boxes(element).every((box, index) => box === kept[index]),
    true
  );
  expect('and ticks the one viewed', ticked(element), ['Player-2']);

  bar.update(state({ view: world }));

  expect('the whole map chooses the world kind', kind(element), ['world']);
  expect(
    'as a property too',
    [radio(element, 'world').checked, radio(element, 'players').checked],
    [true, false]
  );
  expect('and ticks no one', checked(element), []);
  expect('as a property too', ticked(element), []);

  bar.update(state({ view: watching('Player-1') }));

  expect(
    'back to the civilizations',
    [kind(element), checked(element)],
    [['players'], ['Player-1']]
  );

  // The ending of a game watched, and of one played.
  new GameOverWindow(details(), transport, { observer: true });

  expect('a watched game ends with the main menu alone', buttonTexts(), [
    'Main menu',
  ]);
  expect('and records no Hall of Fame entry', hallOfFame().length, 0);

  document
    .querySelectorAll('dialog.window')
    .forEach((window) => window.remove());

  new GameOverWindow(details(), transport);

  expect('a game played that can go on offers Keep playing', buttonTexts(), [
    'Keep playing',
    'Main menu',
  ]);
  expect('and records its entry', hallOfFame().length, 1);

  document
    .querySelectorAll('dialog.window')
    .forEach((window) => window.remove());

  new GameOverWindow(details({ keepPlaying: false }), transport, {
    observer: true,
  });

  expect(
    'a watched game that could not go on has the main menu alone too',
    buttonTexts(),
    ['Main menu']
  );
  expect('and still records nothing more', hallOfFame().length, 1);

  document
    .querySelectorAll('dialog.window')
    .forEach((window) => window.remove());

  // The session, given an observer.
  sent.splice(0);
  historyPushes = 0;

  startSession(() => state());

  const map = document.getElementById('map') as HTMLElement;

  expect(
    'a watched game has no welcome',
    document.querySelectorAll('.welcome').length,
    0
  );
  expect('nor a leave guard', historyPushes, 0);
  expect(
    'its bar is in the map, with the game viewed as the first player',
    [map.querySelectorAll('.observer-bar').length, checked(map)],
    [1, ['Player-1']]
  );
  expect(
    "the player's panel is shown for civilizations' views",
    playerInfo().hidden,
    false
  );
  expect(
    "the session listens for the worker's observer state",
    receivers.some(([name]) => name === 'observer'),
    true
  );

  deliver('observer', state({ paused: true, view: watching('Player-2') }));

  expect(
    'the bar is redrawn when the worker sends observer',
    [checked(map), button(map).textContent, status(map)],
    [['Player-2'], 'Play', 'Paused']
  );
  expect("and the player's panel is still shown", playerInfo().hidden, false);

  deliver('observer', state({ paused: true, view: world }));

  expect(
    'the whole map redraws the bar and hides the panel',
    [kind(map), checked(map), playerInfo().hidden],
    [['world'], [], true]
  );

  deliver('observer', state({ paused: true, view: watching('Player-3') }));

  expect(
    "civilizations again show the player's panel",
    [kind(map), checked(map), playerInfo().hidden],
    [['players'], ['Player-3'], false]
  );
  expect(
    'and is still the one bar',
    map.querySelectorAll('.observer-bar').length,
    1
  );

  button(map).dispatchEvent(new Event('click'));

  expect("the session's bar sends over the session's transport", sent, [
    ['resume', null],
  ]);

  deliver('turnEnded');

  expect(
    'a turn ending sets the waiting banner to Observer.watching',
    map.querySelector('.waiting')?.textContent,
    'Watching'
  );

  // A session that begins on the whole map.
  startSession(() => state({ view: world }));

  expect(
    "a session begun on the whole map hides the player's panel and chooses the world",
    [playerInfo().hidden, kind(document.getElementById('map') as HTMLElement)],
    [true, ['world']]
  );

  deliver('observer', state({ view: watching('Player-1') }));

  expect(
    'and shows the panel once civilizations are viewed',
    playerInfo().hidden,
    false
  );

  // A game played, for comparison.
  historyPushes = 0;

  startSession();

  const playedMap = document.getElementById('map') as HTMLElement;

  expect(
    'a game played is welcomed',
    document.querySelectorAll('.welcome').length,
    1
  );
  expect('and guarded', historyPushes, 1);
  expect(
    'and has no observer bar, nor listens for one',
    [
      playedMap.querySelectorAll('.observer-bar').length,
      receivers.some(([name]) => name === 'observer'),
    ],
    [0, false]
  );

  deliver('turnEnded');

  expect(
    'a turn ending sets the waiting banner to Game.waiting',
    playedMap.querySelector('.waiting')?.textContent,
    'Waiting for the other civilizations'
  );

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL observerBar (${failures.length} of ${checks} checks)\n  ${failures
        .slice(0, 20)
        .join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS observerBar (${checks} checks)\n`);

  // The map's layout timers.
  process.exit(0);
};

run().catch((error) => {
  process.stderr.write(`FAIL observerBar: ${error.stack ?? error}\n`);
  process.exit(1);
});
