// The help as the game is played (#1295): each tip comes at its moment, once a game, while Show help is on, and waits
//  its turn with the game's notices. "Don't show help again" turns the option off, and what was still to come goes. A
//  new game hears them all again; a save carried on keeps what it's had, and isn't told of a first city it founded long
//  ago.

// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';
import './lib/interfaces';

import GameTips, {
  tipForNotification,
  tipText,
} from '@civ-clone/ui-menus/components/GameTips';
import type { Player, Unit } from '@civ-clone/ui-protocol/types';
import Notifications from '@civ-clone/ui-hud/components/Notifications';
import i18next from 'i18next';
import i18nOptions from '@civ-clone/ui-game/app/i18nOptions';
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
    process.stderr.write('FAIL game-tips: stopped before its checks\n');
    process.exitCode = 1;
  }
});

let touch = false;

(window as any).matchMedia = (query: string) => ({
  matches: touch && query === '(hover: none)',
  addEventListener: () => {},
  removeEventListener: () => {},
});

const stored = new Map<string, string>();

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  get: () => ({
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => void stored.set(key, value),
  }),
});

const me = { id: 'Player-1' } as Player;

const player = (
  cities: number,
  actions: string[] = [],
  units: string[] = []
): Player =>
  ({
    ...me,
    actions: actions.map((_) => ({ _ })),
    units: units.map((id) => ({ id })),
    cities: Array.from({ length: cities }, (_, index) => ({
      id: `City-${index}`,
      player: me,
    })),
  } as unknown as Player);

const unit = (actions: string[], city: Player | null = null): Unit =>
  ({
    id: 'Unit-1',
    actions: actions.map((_) => ({ _ })),
    tile: { city: city === null ? null : { player: city } },
  } as unknown as Unit);

// The tips shown, closing each as the player would, ticking "Don't show help again" on the one named.
const shown: string[] = [];
let stopOn: string | null = null;

// The window open, not the copy a closing one leaves to fade out.
const live = '.notificationWindow:not(.ui-window-ghost)';

const showAll = (): void => {
  for (
    let open, guard = 0;
    (open = document.querySelector(`${live} .game-tip`)) && guard < 20;
    guard++
  ) {
    const tip = open.getAttribute('data-tip')!;

    shown.push(tip);

    if (tip === stopOn) {
      open.querySelector<HTMLInputElement>('.game-tip-stop input')!.checked =
        true;
    }

    document
      .querySelector<HTMLDialogElement>(live)!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    // The queue checks again as each closes.
  }
};

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  await import('./lib/strings');
  await import('../../translations/civ1-unit/en');

  const notifications = new Notifications(document.body);

  // A new game.
  let tips = new GameTips(notifications, true);

  tips.update(player(0, ['ChooseResearch']), unit(['FoundCity']), 1);
  showAll();

  expect(
    'Settlers able to found a city bring the first tip, not research',
    shown,
    ['found-city']
  );
  expect(
    'with the key the game binds, for a mouse and keyboard',
    tipText('found-city').includes('press b, or choose “Found a new city”'),
    true
  );

  touch = true;
  expect(
    'and no key on a touch screen',
    [
      tipText('found-city').includes('press'),
      tipText('found-city').includes('“Found a new city”'),
    ],
    [false, true]
  );
  touch = false;

  tips.update(player(0), unit(['FoundCity']), 1);
  showAll();

  expect('each tip once', shown, ['found-city']);

  // The city founded: its tip and the research choice, one after the other.
  tips.update(player(1, ['ChooseResearch']), null, 2);
  showAll();

  expect('a first city, then research, one at a time', shown, [
    'found-city',
    'city-founded',
    'research',
  ]);

  // Notices bring theirs; others bring none.
  tips.notification('City.building-complete.unit', player(1));
  tips.notification('City.grown', player(1));
  // The new unit, at home and able to fortify, before its tip has been read: that one first, on its own.
  tips.update(player(1), unit(['Fortify'], me), 3);
  showAll();
  expect('a unit built brings how to move it, and only that', shown.slice(3), [
    'unit-built',
  ]);

  // Then, a unit at home that can fortify; one that can elsewhere isn't told.
  tips.update(player(1), unit(['Fortify']), 3);
  showAll();
  expect('fortifying is told only in a city of the player’s', shown.length, 4);

  tips.update(player(1), unit(['Fortify'], me), 3);
  showAll();
  expect('and is, there, once the new unit’s tip is read', shown[4], 'fortify');

  // Famine either way.
  expect(
    'a unit lost to famine brings the starving tip too',
    tipForNotification('City.food-storage-exhausted.unit-lost', player(1)),
    'starving'
  );

  // Waiting its turn: behind a notice already open.
  notifications.receive({ key: 'City.civil-disorder', data: {} });
  tips.notification('City.civil-disorder', player(1));

  expect(
    'a tip waits for the window open to close',
    document.querySelectorAll(`${live} .game-tip`).length,
    0
  );

  document
    .querySelector<HTMLDialogElement>(live)!
    .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  stopOn = 'disorder';
  showAll();
  stopOn = null;

  expect('then shows', shown[5], 'disorder');
  expect(
    '“Don’t show help again” turns Show help off',
    options.get('showHelp'),
    false
  );

  // Turned off: no more, and what was waiting goes.
  tips.notification('Barbarians.landing', player(1));
  tips.update(player(1), null, 25);
  showAll();
  expect('off, no more tips', shown.length, 6);

  options.set('showHelp', true);
  notifications.receive({ key: 'City.civil-disorder', data: {} });
  tips.notification('Barbarians.landing', player(1));
  options.set('showHelp', false);
  document
    .querySelector<HTMLDialogElement>(live)!
    .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  showAll();
  expect('turned off with one waiting, it goes', shown.length, 6);

  // Back on in Options: the rest of this game's tips.
  options.set('showHelp', true);
  tips.update(player(1), null, 25);
  showAll();
  expect('turned back on, the rest come', shown[6], 'expand');

  tips.dispose();

  // A save carried on keeps what it has had.
  tips = new GameTips(notifications, false);
  tips.update(player(0), unit(['FoundCity']), 1);
  tips.notification('Barbarians.landing', player(1));
  showAll();
  expect('a game carried on hears only what it hasn’t', shown.slice(7), [
    'barbarians',
  ]);
  tips.dispose();

  // A save of a grown empire, in a browser that has heard nothing: no first-turn tips.
  options.set('helpSeen', []);
  tips = new GameTips(notifications, false);
  tips.update(player(6, ['ChooseResearch']), unit(['Fortify'], me), 200);
  tips.notification('City.building-complete.unit', player(6));
  showAll();
  expect('a grown empire isn’t told of its first city', shown.length, 8);
  tips.dispose();

  // A unit built where the city builds the same again, with no notice ("Keep building military units"): told of all
  //  the same, by the unit that's new.
  options.set('helpSeen', []);
  tips = new GameTips(notifications, false);
  tips.update(player(1, [], ['Unit-1']), null, 5);
  showAll();
  expect('the units there at first are none of them new', shown.length, 8);
  tips.update(player(1, [], ['Unit-1', 'Unit-2']), null, 6);
  showAll();
  expect('a unit built with no notice is told of', shown[8], 'unit-built');
  tips.dispose();

  // An uprising that came to nothing brings no tip.
  expect(
    'a failed uprising is no arrival',
    [
      tipForNotification('Barbarians.uprising-failed', player(1)),
      tipForNotification('Barbarians.uprising-armed', player(1)),
    ],
    [null, 'barbarians']
  );

  // Waiting behind a choice, which isn't a notice: research, say.
  options.set('helpSeen', []);
  tips = new GameTips(notifications, false);

  const choice = document.createElement('dialog');

  choice.className = 'window ui-choice-window';
  choice.setAttribute('open', '');
  document.body.append(choice);
  tips.notification('City.civil-disorder', player(1));

  expect(
    'a tip waits while a choice is open',
    document.querySelectorAll(`${live} .game-tip`).length,
    0
  );

  choice.remove();
  // The queue looks again on its next poll.
  await new Promise((resolve) => setTimeout(resolve, 600));
  showAll();
  expect('and shows once it’s answered', shown[9], 'disorder');
  tips.dispose();

  // A new game hears them all again.
  tips = new GameTips(notifications, true);
  tips.update(player(0), unit(['FoundCity']), 1);
  showAll();
  expect('a new game starts the tips again', shown[10], 'found-city');
  tips.dispose();

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL game-tips (${failures.length} of ${checks})\n  ${failures.join(
        '\n  '
      )}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS game-tips (${checks} checks)\n`);
  process.exit(0);
};

run().catch((error) => {
  process.stderr.write(`FAIL game-tips: ${error?.stack ?? error}\n`);
  process.exit(1);
});
