// How to play (#1270): on a touch screen it tells of taps and pressing and holding, with no keys but behind a "Keyboard
//  shortcuts" fold; with a mouse, of clicks, the wheel and the keys, every unit order key with its name. The player can
//  switch to the other device, and a change of pointer (a tablet docked) switches it unless the player chose. The
//  modern interface's right-click and square tooltips are told of only there. The title screen's first-visit line is
//  offered until answered, then not again, and still works where the browser keeps nothing.

// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';
import './lib/interfaces';

import HowToPlay, {
  gameKeyRows,
  unitKeyRows,
} from '@civ-clone/ui-menus/components/HowToPlay';
import howToPlayPrompt, {
  howToPlaySeen,
} from '@civ-clone/ui-menus/components/howToPlayPrompt';
import { applyInterface } from '@civ-clone/ui-platform/lib/interfaceMode';
import { keyToActionsMap } from '@civ-clone/ui-client/lib/unitActionKeys';
import i18next from 'i18next';
import i18nOptions from '@civ-clone/ui-game/app/i18nOptions';

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
    process.stderr.write('FAIL how-to-play: stopped before its checks\n');
    process.exitCode = 1;
  }
});

// The pointer, as `(hover: none)` answers it, and who's listening for it to change.
let touch = false;
const listeners: (() => void)[] = [];

(window as any).matchMedia = (query: string) => ({
  matches: touch && query === '(hover: none)',
  addEventListener: (type: string, listener: () => void) =>
    type === 'change' && listeners.push(listener),
  removeEventListener: (type: string, listener: () => void) => {
    const index = listeners.indexOf(listener);

    if (index !== -1) {
      listeners.splice(index, 1);
    }
  },
});

// Browser storage, which can be blocked.
let blocked = false;
const stored = new Map<string, string>();

Object.defineProperty(window, 'localStorage', {
  configurable: true,
  get: () => {
    if (blocked) {
      throw new Error('blocked');
    }

    return {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
    };
  },
});

const body = (window: HowToPlay): Element =>
  window.element().querySelector('.how-to-play-body')!;

const keyCaps = (element: Element | null): number =>
  element?.querySelectorAll('kbd').length ?? 0;

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  // Each package's own words, as the page loads them all.
  await import('./lib/strings');
  await import('../../translations/civ1-unit/en');

  applyInterface('modern', null);

  // A touch screen.
  touch = true;

  let help = HowToPlay.open();

  expect('a touch screen is described as one', help.device(), 'touch');
  expect(
    'with taps and pressing and holding',
    [
      body(help).textContent!.includes('Tap one of your cities'),
      body(help).textContent!.includes('Press and hold a square'),
    ],
    [true, true]
  );
  expect(
    'Found City by the name its button has',
    body(help).textContent!.includes('choose “Found a new city”'),
    true
  );
  expect(
    'and no keys outside the Keyboard shortcuts fold',
    [
      keyCaps(body(help)) - keyCaps(body(help).querySelector('details')),
      keyCaps(body(help).querySelector('details')) > 0,
    ],
    [0, true]
  );
  expect(
    'opening it again brings the one open forward',
    HowToPlay.open() === help,
    true
  );

  // The keyboard shortcuts, opened, stay open when the device changes.
  body(help).querySelector('details')!.setAttribute('open', '');
  touch = false;
  listeners.forEach((listener) => listener());
  touch = true;
  listeners.forEach((listener) => listener());

  expect(
    'the keyboard shortcuts, opened, stay open across a change',
    body(help).querySelector('details')?.hasAttribute('open'),
    true
  );

  // Switched by the player.
  (
    body(help).querySelector(
      '.how-to-play-device-option[data-device="desktop"]'
    ) as HTMLButtonElement
  ).click();

  expect('the player can switch to the mouse', help.device(), 'desktop');
  expect(
    'which tells of clicks, the wheel and the keys, outside any fold',
    [
      body(help).textContent!.includes('Click one of your cities'),
      body(help).textContent!.includes('mouse wheel'),
      body(help).querySelector('details') === null,
      keyCaps(body(help)) > 0,
    ],
    [true, true, true, true]
  );
  expect(
    'and the switch says which is shown',
    Array.from(body(help).querySelectorAll('.how-to-play-device-option')).map(
      (button) => button.getAttribute('aria-pressed')
    ),
    ['false', 'true']
  );

  touch = false;
  listeners.forEach((listener) => listener());

  expect(
    'chosen, a change of pointer leaves it as chosen',
    help.device(),
    'desktop'
  );

  help.close();

  expect('closed, it stops listening', listeners.length, 0);

  // A mouse, and a change of pointer.
  help = HowToPlay.open();

  expect('a mouse is described as one', help.device(), 'desktop');

  touch = true;
  listeners.forEach((listener) => listener());

  expect('a tablet undocked switches to touch', help.device(), 'touch');

  touch = false;
  listeners.forEach((listener) => listener());
  help.show('desktop');

  // The interface's own ways.
  expect(
    'the modern interface tells of its right-click and square tooltips',
    [
      body(help).textContent!.includes('Right-click a square'),
      body(help).textContent!.includes('on a square to see what’s there'),
    ],
    [true, true]
  );

  help.close();
  applyInterface('classic', null);
  help = HowToPlay.open();

  expect(
    'the classic one, which has neither, tells of neither',
    [
      body(help).textContent!.includes('Right-click'),
      body(help).textContent!.includes('Press and hold on a square'),
      body(help).textContent!.includes('on a square to see what’s there'),
    ],
    [false, true, false]
  );

  help.close();

  // The keys, from what the game binds.
  expect(
    'every unit order key is listed, each with its orders by name',
    unitKeyRows().map(([[key]]) => key),
    Object.keys(keyToActionsMap)
  );
  expect(
    'named as the unit’s buttons name them',
    unitKeyRows().find(([[key]]) => key === 'b')?.[1],
    'Found a new city or Join city'
  );
  expect(
    'each name once, where two orders share one',
    unitKeyRows()
      .find(([[key]]) => key === 'P')?.[1]
      .split(' or ').length,
    1
  );
  expect(
    'and the game’s keys each have their words',
    gameKeyRows().filter(([, text]) => text.startsWith('HowToPlay.')),
    []
  );

  // The first-visit line, in a browser that hasn't seen the help (opening it above answered it).
  stored.clear();

  let prompt = howToPlayPrompt();

  expect('a newcomer is offered How to play', prompt !== null, true);

  prompt!
    .querySelector<HTMLButtonElement>('.how-to-play-prompt-dismiss')!
    .click();

  expect(
    'dismissed, it is remembered and not offered again',
    [howToPlaySeen(), howToPlayPrompt()],
    [true, null]
  );

  stored.clear();
  prompt = howToPlayPrompt();
  document.body.append(prompt!);
  prompt!.querySelector<HTMLButtonElement>('.how-to-play-prompt-open')!.click();

  expect(
    'answered by opening the help, it goes, and the help opens',
    [
      howToPlaySeen(),
      prompt!.isConnected,
      document.querySelector('dialog.how-to-play') !== null,
    ],
    [true, false, true]
  );

  HowToPlay.open().close();

  // Opened from a menu, the line is answered too, and goes from the screen.
  stored.clear();
  prompt = howToPlayPrompt();
  document.body.append(prompt!);
  HowToPlay.open().close();

  expect(
    'opened from a menu, the line is answered, and goes',
    [howToPlaySeen(), prompt!.isConnected],
    [true, false]
  );

  blocked = true;
  prompt = howToPlayPrompt();

  expect(
    'where the browser keeps nothing, it is offered, and dismissing it does no harm',
    [
      prompt !== null,
      (() => {
        try {
          prompt!
            .querySelector<HTMLButtonElement>('.how-to-play-prompt-dismiss')!
            .click();

          return true;
        } catch {
          return false;
        }
      })(),
    ],
    [true, true]
  );

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL how-to-play (${failures.length} of ${checks})\n  ${failures.join(
        '\n  '
      )}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS how-to-play (${checks} checks)\n`);
};

run().catch((error) => {
  process.stderr.write(`FAIL how-to-play: ${error?.stack ?? error}\n`);
  process.exit(1);
});
