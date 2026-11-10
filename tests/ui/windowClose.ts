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
import './lib/interfaces';

import NotificationWindow from '@civ-clone/ui-component-window/NotificationWindow';
import Notifications from '@civ-clone/ui-hud/components/Notifications';
import Window from '@civ-clone/ui-component-window/Window';
import { applyInterface } from '@civ-clone/ui-platform/lib/interfaceMode';
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

  // A window's cancel is what Escape does, whether or not it can be closed (#659), and in place of closing it.
  (
    [
      [Window, false],
      [Window, true],
      [NotificationWindow, false],
      [NotificationWindow, true],
    ] as [typeof Window, boolean][]
  ).forEach(([Type, canClose]) => {
    const cancelled = { count: 0 },
      cancellable = new Type('Choose', 'Body', {
        canClose,
        cancel: () => {
          cancelled.count++;

          cancellable.close();
        },
        modal: true,
      });

    expect(
      `Escape on a ${Type.name} with a cancel (canClose: ${canClose}) is cancelled`,
      press(cancellable.element(), 'Escape').defaultPrevented,
      true
    );
    expect(
      'and runs its cancel once, which closes it',
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

  // Under the new interface a closing window leaves a copy of itself to fade out, with its classes (#738). Taken for
  //  the window, it held every notice after the first until another arrived.
  applyInterface('modern', null);

  // Escape on the notice shown, if one is.
  const closeNotice = (): void => {
    const [notice] = notices();

    if (notice) {
      press(notice, 'Escape');
    }
  };

  const faded = new Notifications(document.body);

  ['fourth', 'fifth', 'sixth'].forEach((key) =>
    faded.receive({ key, data: {} })
  );

  await poll();

  closeNotice();

  expect(
    'with the closed one fading out, the next notice is shown at once',
    [
      document.querySelectorAll('.notificationWindow.ui-window-ghost').length >
        0,
      notices().length,
    ],
    [true, 1]
  );

  closeNotice();
  closeNotice();

  expect('and the last of them after it', notices().length, 0);

  // Any window of the kind holds the next notice, though only the ones `Notifications` opens say when they close: the
  //  notice is shown once it has gone.
  const other = new NotificationWindow('Other', 'Not a notice');

  faded.receive({ key: 'seventh', data: {} });

  const others = (): boolean[] =>
    notices().map((notice) => notice.textContent!.includes('Not a notice'));

  expect('a notice waits behind another window', others(), [true]);

  other.close();

  await poll();

  expect('and is shown once that window has closed', others(), [false]);

  closeNotice();

  applyInterface('classic', null);

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
