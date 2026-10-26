// A window closed with Escape leaves nothing behind that takes the keys (#351). Chromium closes the top dialog itself
//  for an Escape that isn't cancelled, and when closing a notice opens the next one in the same keydown, it closed that
//  one too, with no cancelable `cancel`: it stayed in the page, not drawn, holding the keys, and no more notices were
//  shown. So Escape and Enter are cancelled where a window acts on them, and a dialog the browser closes anyway is
//  closed properly, or shown again if it can't be closed (the Game Over window).
//
// linkedom has no `<dialog>` behaviour, so the browser's part is played here: `close()` on the element, then its own
//  `close` event.

// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';

import NotificationWindow from '../../src/js/UI/components/NotificationWindow';
import Notifications from '../../src/js/UI/components/Notifications';
import Window from '../../src/js/UI/components/Window';
import i18next from 'i18next';

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
    process.stderr.write(`FAIL window-close: stopped after ${checks} checks\n`);
    process.exitCode = 1;
  }
});

const press = (target: HTMLElement, key: string): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key,
    });

    target.dispatchEvent(event);

    return event;
  },
  // What the browser does when it closes a dialog itself.
  browserCloses = (dialog: HTMLElement): void => {
    (dialog as HTMLDialogElement).close();

    dialog.dispatchEvent(new Event('close'));
  },
  inPage = (window: Window): [boolean, boolean] => [
    window.element().isConnected,
    (window.element() as HTMLDialogElement).open,
  ],
  closesHeard = (window: Window): { count: number } => {
    const heard = { count: 0 };

    window.on('close', () => heard.count++);

    return heard;
  };

// Longer than `Notifications`' 500ms polling.
const poll = () => new Promise((resolve) => setTimeout(resolve, 600));

const run = async (): Promise<void> => {
  await i18next.init({ lng: 'en', resources: {} });

  // Escape and Enter on a notice: cancelled, so the browser doesn't act on them as well.
  ['Escape', 'Enter'].forEach((key) => {
    const notice = new NotificationWindow('Notice', 'Body', { modal: true }),
      event = press(notice.element(), key);

    expect(`${key} on a notice is cancelled`, event.defaultPrevented, true);
    expect(`and closes it`, inPage(notice), [false, false]);
  });

  // Escape on any other window, whether or not it can be closed.
  const closable = new Window('Window', 'Body', { modal: true });

  expect(
    'Escape on a window is cancelled',
    press(closable.element(), 'Escape').defaultPrevented,
    true
  );
  expect('and closes it', inPage(closable), [false, false]);

  const fixed = new Window('Game over', 'Body', {
    canClose: false,
    modal: true,
  });

  expect(
    "Escape on one that can't be closed is cancelled too",
    press(fixed.element(), 'Escape').defaultPrevented,
    true
  );
  expect('and leaves it open', inPage(fixed), [true, true]);

  // A window's cancel is what Escape does, whether or not it can be closed (#659).
  [Window, NotificationWindow].forEach((Type) => {
    const cancelled = { count: 0 },
      cancellable = new Type('Choose', 'Body', {
        canClose: false,
        cancel: () => {
          cancelled.count++;

          cancellable.close();
        },
        modal: true,
      });

    expect(
      `Escape on a ${Type.name} with a cancel is cancelled`,
      press(cancellable.element(), 'Escape').defaultPrevented,
      true
    );
    expect(
      'and runs its cancel',
      [cancelled.count, inPage(cancellable)],
      [1, [false, false]]
    );
  });

  // Closed by the browser.
  const heardFixed = closesHeard(fixed);

  browserCloses(fixed.element());

  expect(
    "one that can't be closed is shown again",
    [inPage(fixed), heardFixed.count],
    [[true, true], 0]
  );

  fixed.close();

  const dismissed = new Window('Window', 'Body', { modal: true }),
    heardDismissed = closesHeard(dismissed);

  browserCloses(dismissed.element());

  expect(
    'any other is closed properly, and says so once',
    [inPage(dismissed), heardDismissed.count],
    [[false, false], 1]
  );

  // `close()` closes the dialog too, and the browser's `close` that follows isn't heard as a second.
  const closed = new Window('Window', 'Body', { modal: true }),
    heardClosed = closesHeard(closed);

  closed.close();
  closed.element().dispatchEvent(new Event('close'));

  expect('closing one says so once', heardClosed.count, 1);

  // Closed again, as a list's caller does from its choice once the list has closed itself: nothing more is said
  //  (#599). Shown again, it can be closed again.
  closed.close();

  expect('closing it again says nothing', heardClosed.count, 1);

  closed.display();
  closed.close();

  expect('one shown again says so when it closes', heardClosed.count, 2);

  // Three notices together. Escape on the first opens the second at once; if the browser closes that one too, the
  //  third is still shown, and nothing is left in the page.
  const notifications = new Notifications(document.body),
    notices = (): HTMLElement[] =>
      Array.from(document.querySelectorAll('dialog.notificationWindow'));

  ['first', 'second', 'third'].forEach((key) =>
    notifications.receive({ key, data: {} })
  );

  expect('the first notice is shown', notices().length, 1);

  // Once its polling has seen the notice and stopped, as it has by the time a player presses a key: closing it then
  //  opens the next one inside the same keydown.
  await poll();

  press(notices()[0], 'Escape');

  expect('Escape opens the second', notices().length, 1);

  browserCloses(notices()[0]);

  await poll();

  expect(
    'the browser closing the second lets the third be shown',
    notices().map((notice) => (notice as HTMLDialogElement).open),
    [true]
  );

  press(notices()[0], 'Escape');

  expect('and then there are none', notices().length, 0);

  finished = true;

  if (failures.length) {
    console.error(`FAIL window-close\n  ${failures.join('\n  ')}`);

    process.exit(1);
  }

  console.log(`PASS window-close (${checks} checks)`);

  // `Notifications` polls on an interval.
  process.exit(0);
};

run();
