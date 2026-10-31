// The new window chrome (#738), behind the interface flag (#735): the eyebrow over the title, the footer with its
//  actions (a window's own footer moved there, the primary last, a quiet Close where there are none),
//  Enter for the primary, Escape for the cancel action, focus back where it was, and a copy that fades as the window
//  closes. With the flag off, an action window is built exactly as before.

// Must stay first: `Window.ts` reads `document.body` as it loads.
import './lib/dom';

import ActionWindow from '../../src/js/UI/components/ActionWindow';
import ConfirmationWindow from '../../src/js/UI/components/ConfirmationWindow';
import LoadGameWindow from '../../src/js/UI/components/LoadGameWindow';
import Window from '../../src/js/UI/components/Window';
import { applyInterface } from '../../src/js/UI/lib/interfaceMode';
import i18next from 'i18next';
import i18nOptions from '../../src/js/UI/app/i18nOptions';

const failures: string[] = [];
let checks = 0;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${description}
    expected: ${JSON.stringify(expected)}
    actual:   ${JSON.stringify(actual)}`
    );
  }
};

// The footer is put in order once the window has finished building: a tick later.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const press = (target: EventTarget, key: string): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key,
    });

    target.dispatchEvent(event);

    return event;
  },
  labels = (window: Window) =>
    Array.from(
      window.element().querySelectorAll('.ui-window-actions button')
    ).map((button) => button.childNodes[0]?.textContent?.trim());

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  await import('../../translations/local/en');

  applyInterface('classic', null);

  {
    const window = new ActionWindow('Notice', 'Body', {
      actions: { cancel: { label: 'Cancel', action: () => {}, cancel: true } },
    });
    await settle();

    expect(
      'with the flag off, an action window is built as before',
      [
        window.hasClass('ui-window'),
        window
          .element()
          .querySelectorAll(
            ':scope > .body > .action-window-content > footer button'
          ).length,
        window.element().querySelector(':scope > .ui-window-footer'),
      ],
      [false, 2, null]
    );

    window.close();
  }

  applyInterface('new', null);

  {
    const window = new Window('Trade report', 'Body', {
      classes: 'trade-report',
    });
    await settle();

    expect(
      'a report says what it is and its key over its title',
      [
        window.hasClass('ui-window'),
        window.element().querySelector('header .ui-window-eyebrow')
          ?.textContent,
        window.element().querySelector('header h3')?.textContent,
      ],
      [true, 'Report · F5', 'Trade report']
    );
    expect(
      'and with no actions of its own, a quiet Close',
      [
        labels(window),
        window.element().querySelector('.ui-window-actions .btn-quiet') !==
          null,
      ],
      [['Close'], true]
    );

    (
      window
        .element()
        .querySelector('.ui-window-actions button') as HTMLButtonElement
    ).click();

    expect('which closes it', window.element().isConnected, false);
  }

  {
    const window = new Window('Plain', 'Body');
    await settle();

    expect(
      'a window with no eyebrow has none',
      window.element().querySelector('.ui-window-eyebrow'),
      null
    );

    window.close();
  }

  {
    const ran: string[] = [];
    const window = new ActionWindow('Choose', 'Body', {
      actions: {
        primary: { label: 'Build', action: () => ran.push('build') },
        other: { label: 'Auto', action: () => ran.push('auto') },
        cancel: {
          label: 'Cancel',
          action: () => ran.push('cancel'),
          cancel: true,
        },
      },
    });
    await settle();

    expect(
      "the window's own buttons move into the footer, the quiet first and the primary last",
      [labels(window), window.element().querySelector(':scope > .body footer')],
      [['Cancel', 'Auto', 'Build'], null]
    );
    expect(
      'with Enter shown on the primary',
      (
        window
          .element()
          .querySelector(
            '.ui-window-actions .btn-primary'
          ) as HTMLElement | null
      )?.dataset.hotkey,
      'Enter'
    );

    const enter = press(window.element(), 'Enter');

    expect(
      'Enter runs the primary, and nothing else hears it',
      [ran, enter.defaultPrevented, window.element().isConnected],
      [['build'], true, true]
    );

    press(
      window
        .element()
        .querySelector('.ui-window-actions .btn-secondary') as HTMLElement,
      'Enter'
    );

    expect(
      'Enter on another button is left to that button, which runs its own',
      ran,
      ['build', 'auto']
    );

    press(window.element(), 'Escape');

    expect('Escape runs the cancel action', ran, ['build', 'auto', 'cancel']);

    window.close();
  }

  {
    let confirmed = 0;

    const window = new ConfirmationWindow('Retire', 'Sure?', () => confirmed++);
    await settle();

    expect(
      'a confirmation built with its own footer gets the same footer',
      [
        labels(window),
        (
          window
            .element()
            .querySelector(
              '.ui-window-actions .btn-primary'
            ) as HTMLElement | null
        )?.dataset.hotkey,
      ],
      [['Cancel', 'OK'], 'Enter']
    );

    window.close();
  }

  {
    let started = 0;

    const start = document.createElement('button'),
      form = document.createElement('div');

    start.className = 'btn-primary start';
    start.textContent = 'Start';
    start.addEventListener('click', () => started++);
    form.append(document.createElement('table'), start);

    const window = new Window('Game setup', form);
    await settle();

    expect(
      'a window that ends in its primary button alone has it moved into the footer, with no Close',
      [
        labels(window),
        form.contains(start),
        (
          window
            .element()
            .querySelector(
              '.ui-window-actions .btn-primary'
            ) as HTMLElement | null
        )?.dataset.hotkey,
      ],
      [['Start'], false, 'Enter']
    );

    press(window.element(), 'Enter');

    expect('and Enter presses it', started, 1);

    const again = document.createElement('div'),
      restart = document.createElement('button');

    restart.className = 'btn-primary';
    restart.textContent = 'Start';
    again.append(restart);
    window.update(again);
    await settle();

    expect(
      'a body drawn again replaces the buttons moved from it',
      labels(window),
      ['Start']
    );

    window.close();
  }

  {
    const opener = document.createElement('button');
    let focused = 0;

    document.body.append(opener);
    opener.addEventListener('focus', () => focused++);

    // The test DOM doesn't keep track of focus: it's said here, as the browser would.
    Object.defineProperty(document, 'activeElement', {
      configurable: true,
      get: () => opener,
    });

    const window = new Window('Opened', 'Body');

    // As the window closes, focus has gone from the page with it.
    delete (document as any).activeElement;
    await settle();
    window.close();

    expect(
      'closing gives focus back to what had it as the window opened',
      focused,
      1
    );
  }

  {
    // The copies of the windows closed above have gone by now.
    await new Promise((resolve) => setTimeout(resolve, 250));

    const window = new Window('Fading', 'Body');
    await settle();

    window.close();

    const ghost = document.querySelector('.ui-window-ghost');

    expect(
      'a copy fades where it was, taking no input, drawn as the window was',
      [
        ghost !== null,
        ghost?.getAttribute('aria-hidden'),
        ghost?.classList.contains('ui-window'),
        ghost?.querySelector('h3')?.textContent,
      ],
      [true, 'true', true, 'Fading']
    );

    await new Promise((resolve) => setTimeout(resolve, 250));

    expect('and goes', document.querySelector('.ui-window-ghost'), null);
  }

  // The review of #760.
  {
    // Load game keeps its footer and adds to it once the window is built.
    const footer = document.createElement('footer'),
      body = document.createElement('div');

    body.append(document.createElement('table'), footer);

    const window = new Window('Load a game', body);
    const fromFile = document.createElement('button');

    fromFile.className = 'btn-secondary';
    fromFile.textContent = 'From a file';
    footer.append(fromFile);
    await settle();

    expect(
      'a footer added to after the window is built keeps its buttons, with no Close beside them',
      [
        labels(window),
        footer.isConnected,
        window.element().querySelector('.ui-window-close'),
      ],
      [['From a file'], true, null]
    );

    window.close();
  }

  {
    // The real one: it adds its From a file button to its footer once built, and with no saves focuses it. It reads a
    //  table body's `rows`, which the test DOM doesn't have, so it's given them here.
    const section = Object.getPrototypeOf(document.createElement('tbody'));

    if (!('rows' in section)) {
      Object.defineProperty(section, 'rows', {
        configurable: true,
        get(this: HTMLElement) {
          return Array.from(this.querySelectorAll('tr'));
        },
      });
    }

    const window = new LoadGameWindow([], async () => null);

    await settle();

    expect(
      'Load game keeps its From a file button, with no Close beside it',
      labels(window),
      ['Load from a file…']
    );

    window.close();
  }

  {
    const card = document.createElement('div'),
      note = document.createElement('footer');

    note.textContent = 'From the Civilopedia';
    card.append(note);

    const window = new Window('Entry', card);

    await settle();

    expect(
      "a footer that isn't buttons stays where it is",
      [card.contains(note), labels(window)],
      [true, ['Close']]
    );

    window.close();
  }

  {
    let started = 0;

    const form = document.createElement('div'),
      details = document.createElement('details'),
      summary = document.createElement('summary'),
      start = document.createElement('button');

    details.append(summary);
    start.className = 'btn-primary';
    start.textContent = 'Start';
    start.addEventListener('click', () => started++);
    form.append(details, start);

    const window = new Window('Game setup', form);

    await settle();
    press(summary, 'Enter');

    const repeat = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter',
      repeat: true,
    });

    // Not every DOM takes `repeat` from the options.
    Object.defineProperty(repeat, 'repeat', { value: true });

    window.element().dispatchEvent(repeat);

    expect(
      'Enter on a summary opens it, and a held Enter presses nothing',
      started,
      0
    );

    window.update(document.createElement('p'));
    await settle();

    expect(
      'a body drawn again without its Start leaves none behind',
      labels(window),
      ['Close']
    );

    window.close();
  }

  {
    const opener = document.createElement('button'),
      next = document.createElement('button');
    let focused = 0;

    document.body.append(opener, next);
    opener.addEventListener('focus', () => focused++);

    Object.defineProperty(document, 'activeElement', {
      configurable: true,
      get: () => opener,
    });

    const window = new Window('Notice', 'Body');

    // Closing it opens the next notice, which takes focus.
    Object.defineProperty(document, 'activeElement', {
      configurable: true,
      get: () => next,
    });
    await settle();
    window.close();
    delete (document as any).activeElement;

    expect(
      'focus that has gone somewhere new as it closes stays there',
      focused,
      0
    );
  }

  applyInterface('classic', null);

  if (failures.length) {
    process.stderr.write(
      `FAIL windowChrome\n${failures
        .map((failure) => `  ${failure}`)
        .join('\n')}\n`
    );
    process.exit(1);
  }

  console.log(`PASS windowChrome (${checks} checks)`);
};

run();
