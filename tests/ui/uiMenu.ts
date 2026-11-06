// The new interface's menu (#808): where it opens, its rows, and the one hover that the pointer, a finger sliding from
//  the press that opened it and the arrow keys all move, which is the row that runs. Then the Game menu built on it,
//  which its button toggles (and the classic one, which a second press now closes, #710), and the unit's long press
//  menu.

// Must stay first: the components read `document` as they load.
import './lib/dom';

import UiMenu, {
  EDGE_MARGIN,
  LAUNCHER_GAP,
  POINT_GAP,
  UiMenuOptions,
  openMenu,
  placeMenu,
} from '../../src/js/UI/components/UiMenu';
import openUnitMenu, {
  squareLine,
} from '../../src/js/UI/components/UiUnitMenu';
import { Tile, Unit, UnitAction } from '../../src/js/UI/types';
import GameMenu from '../../src/js/UI/components/GameMenu';
import { applyInterface } from '../../src/js/UI/lib/interfaceMode';
import i18next from 'i18next';
import i18nOptions from '../../src/js/UI/app/i18nOptions';

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
    process.stderr.write(`FAIL ui-menu: stopped after ${checks} checks\n`);
    process.exitCode = 1;
  }
});

// Unit sprites aren't loaded, which is logged.
console.error = () => {};

// linkedom has no canvas context: one that draws nothing.
(globalThis as any).HTMLCanvasElement.prototype.getContext = () =>
  new Proxy(
    { getImageData: () => ({ data: [] }) } as { [key: string]: unknown },
    {
      get: (target, key: string) => (key in target ? target[key] : () => {}),
      set: (target, key: string, value) => {
        target[key] = value;

        return true;
      },
    }
  );

// linkedom has a MutationObserver, which `./lib/dom` doesn't make global: the menu watches for windows opening with it.
(globalThis as any).MutationObserver ??= (window as any).MutationObserver;

// No layout: the element "under the pointer" is whichever the test says.
let underPointer: Element | null = null;

(document as any).elementFromPoint = () => underPointer;

const pointer = (
  type: string,
  target: EventTarget = document.body,
  init: { button?: number; isPrimary?: boolean; pointerType?: string } = {}
): Event => {
  const event = new Event(type, { bubbles: true, cancelable: true });

  Object.assign(event, {
    clientX: 10,
    clientY: 10,
    button: 0,
    isPrimary: true,
    ...init,
  });
  target.dispatchEvent(event);

  return event;
};

const key = (name: string, target: EventTarget = document.body): Event => {
  const event = new KeyboardEvent('keydown', {
    key: name,
    bubbles: true,
    cancelable: true,
  });

  target.dispatchEvent(event);

  return event;
};

const rows = (menu: UiMenu): HTMLElement[] =>
  Array.from(menu.element().querySelectorAll('.ui-menu-item'));

const hovered = (menu: UiMenu): string[] =>
  rows(menu)
    .filter((row) => row.hasAttribute('data-hover'))
    .map((row) => row.querySelector('.ui-menu-label')!.textContent!);

const menuOf = (options: Partial<UiMenuOptions> = {}, ran: string[] = []) =>
  new UiMenu({
    label: 'Test',
    anchor: { point: { x: 100, y: 100 } },
    sections: [
      {
        items: [
          { label: 'One', key: 'F1', action: () => ran.push('One') },
          { label: 'Two', disabled: true, action: () => ran.push('Two') },
        ],
      },
      {
        heading: 'Reports',
        items: [{ label: 'Three', action: () => ran.push('Three') }],
      },
      { heading: 'Empty', items: [] },
      {
        rule: true,
        items: [
          { label: 'Quit', danger: true, action: () => ran.push('Quit') },
        ],
      },
    ],
    ...options,
  });

(async () => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  await import('../../translations/local/en');
  await import('../../translations/civ1-unit/en');
  await import('../../translations/civ1-world/en');

  // Where it opens.
  {
    const viewport = { width: 800, height: 600 },
      size = { width: 200, height: 300 },
      launcher = {
        left: 700,
        right: 740,
        top: 10,
        bottom: 50,
        width: 40,
        height: 40,
      };

    expect(
      'under a launcher: its right edge on the launcher’s, just below it',
      placeMenu({ below: launcher }, size, viewport),
      { left: 540, top: 50 + LAUNCHER_GAP, maxHeight: 600 - EDGE_MARGIN - 54 }
    );
    expect(
      'under a launcher at the left edge: kept inside the viewport',
      placeMenu({ below: { ...launcher, left: 0, right: 40 } }, size, viewport)
        .left,
      EDGE_MARGIN
    );
    expect(
      'over a press: centred above it',
      placeMenu({ point: { x: 400, y: 400 } }, size, viewport),
      {
        left: 300,
        top: 400 - POINT_GAP - 300,
        maxHeight: 400 - POINT_GAP - EDGE_MARGIN,
      }
    );
    expect(
      'over a press near the top: below it',
      placeMenu({ point: { x: 400, y: 100 } }, size, viewport).top,
      100 + POINT_GAP
    );
    expect(
      'over a press near the right edge: moved in',
      placeMenu({ point: { x: 790, y: 400 } }, size, viewport).left,
      800 - EDGE_MARGIN - 200
    );
    expect(
      'a press left below the viewport by a resize: kept on screen',
      placeMenu(
        { point: { x: 400, y: 700 } },
        { width: 200, height: 300 },
        { width: 800, height: 400 }
      ),
      {
        left: 300,
        top: 400 - EDGE_MARGIN - POINT_GAP - 300,
        maxHeight: 400 - EDGE_MARGIN - POINT_GAP - EDGE_MARGIN,
      }
    );
    expect(
      'taller than both sides, with more room above: from the top, scrolling',
      placeMenu(
        { point: { x: 400, y: 500 } },
        { width: 200, height: 590 },
        viewport
      ),
      { left: 300, top: EDGE_MARGIN, maxHeight: 500 - POINT_GAP - EDGE_MARGIN }
    );
  }

  // What it holds.
  {
    const menu = menuOf(),
      element = menu.element();

    expect(
      'a menu, its rows menu items, the empty section left out',
      [
        element.getAttribute('role'),
        rows(menu).map((row) => row.getAttribute('role')),
        Array.from(element.querySelectorAll('.ui-menu-eyebrow')).map(
          (eyebrow) => eyebrow.textContent
        ),
        element.querySelectorAll('.ui-menu-rule').length,
      ],
      ['menu', ['menuitem', 'menuitem', 'menuitem', 'menuitem'], ['Reports'], 1]
    );
    expect(
      'a key shown only where there is one, and named for assistive technology',
      rows(menu).map((row) => [
        row.querySelector('kbd')?.textContent ?? null,
        row.getAttribute('aria-keyshortcuts'),
      ]),
      [
        ['F1', 'F1'],
        [null, null],
        [null, null],
        [null, null],
      ]
    );
    expect(
      'the row that ends the game marked, the disabled one disabled',
      rows(menu).map((row) => [
        row.classList.contains('danger'),
        (row as HTMLButtonElement).disabled,
      ]),
      [
        [false, false],
        [false, true],
        [false, false],
        [true, false],
      ]
    );
    expect(
      'in the page, and the one open',
      [element.parentNode === document.body, openMenu() === menu],
      [true, true]
    );

    menu.close();
  }

  // The pointer's hover is the selection.
  {
    const ran: string[] = [],
      menu = menuOf({}, ran),
      [one, two, three] = rows(menu);

    expect('opened with the pointer: nothing hovered', hovered(menu), []);

    underPointer = three.querySelector('.ui-menu-label');
    pointer('pointermove');
    expect('the row under the pointer, by any part of it', hovered(menu), [
      'Three',
    ]);

    underPointer = one;
    pointer('pointermove');
    expect('one hover at a time', hovered(menu), ['One']);

    underPointer = two;
    pointer('pointermove');
    expect('a disabled row takes none: off the rows', hovered(menu), []);

    underPointer = one;
    pointer('pointermove');
    pointer('pointerdown', one);
    expect('pressed', one.hasAttribute('data-pressed'), true);

    pointer('pointerup', one);
    expect(
      'lifted on a row: it runs, and the menu closes',
      [ran, menu.isOpen(), openMenu()],
      [['One'], false, null]
    );
  }

  // A press outside closes it; its launcher's own press is the launcher's.
  {
    const launcher = document.createElement('button');

    document.body.append(launcher);

    const menu = menuOf({ launcher });

    expect(
      'the launcher says it is open',
      launcher.getAttribute('aria-expanded'),
      'true'
    );

    underPointer = null;
    pointer('pointerdown', launcher);
    expect(
      'a press on the launcher leaves it to the launcher',
      menu.isOpen(),
      true
    );

    pointer('pointerdown', document.body);
    expect(
      'a press elsewhere closes it',
      [menu.isOpen(), launcher.getAttribute('aria-expanded')],
      [false, 'false']
    );

    launcher.remove();
  }

  // Only the page losing focus closes it: not an element's blur, which reaches the window's capture listener too, as the
  //  launcher's does when the keys move the focus to the first row.
  {
    const launcher = document.createElement('button');

    document.body.append(launcher);

    const menu = menuOf({ launcher, byKeyboard: true });

    launcher.dispatchEvent(new Event('blur', { bubbles: true }));
    expect('an element’s blur: still open', menu.isOpen(), true);

    window.dispatchEvent(new Event('blur'));
    expect('the window’s blur: closed', menu.isOpen(), false);

    launcher.remove();
  }

  // One pointer drives it: a second finger's slide, press and lift are nothing to it.
  {
    const ran: string[] = [],
      menu = menuOf({ pressed: true }, ran),
      [one, , three] = rows(menu),
      second = { isPrimary: false };

    underPointer = one;
    pointer('pointermove', document.body, second);
    expect('a second finger’s slide: no hover', hovered(menu), []);

    pointer('pointerdown', one, second);
    expect(
      'a second finger’s press: not drawn pressed',
      one.hasAttribute('data-pressed'),
      false
    );

    pointer('pointerup', document.body, second);
    expect(
      'a second finger’s lift: nothing run, still held',
      [ran, menu.isOpen()],
      [[], true]
    );

    underPointer = three;
    pointer('pointermove');
    pointer('pointerup');
    expect('the first finger’s still does', ran, ['Three']);
  }

  // The click a lift sends finds the menu gone: it isn't left to land on what was under it.
  {
    // The rows run above are done waiting for their own clicks.
    await new Promise((resolve) => setTimeout(resolve, 550));

    const under = document.createElement('button'),
      clicks: string[] = [];

    document.body.append(under);

    // A finger's slide from the long press sends no click, so waits for none: the next tap is a real one.
    const slid = menuOf({ pressed: true });

    underPointer = rows(slid)[0];
    pointer('pointermove');
    pointer('pointerup', document.body, { pointerType: 'touch' });

    const tap = new Event('click', { bubbles: true, cancelable: true });

    under.dispatchEvent(tap);
    expect(
      'a slid finger’s lift: the next tap left alone',
      tap.defaultPrevented,
      false
    );

    const menu = menuOf(),
      [one] = rows(menu);

    underPointer = one;
    pointer('pointermove');
    pointer('pointerup');

    // After the menu's listener: linkedom runs a node's in the order they were added, and a window's after the page's.
    window.addEventListener('click', (event) => clicks.push(event.type));

    const click = new Event('click', { bubbles: true, cancelable: true });

    under.dispatchEvent(click);
    expect(
      'the lift’s click: swallowed',
      [menu.isOpen(), click.defaultPrevented, clicks],
      [false, true, []]
    );

    under.dispatchEvent(new Event('click', { bubbles: true }));
    expect('the next click: left alone', clicks, ['click']);

    under.remove();
  }

  // A press lifted by another button still lets go of the hold.
  {
    const ran: string[] = [],
      menu = menuOf({ pressed: true }, ran),
      [one] = rows(menu);

    underPointer = one;
    pointer('pointermove');
    pointer('pointerup', document.body, { button: 1 });
    underPointer = null;
    pointer('pointerup');
    expect(
      'the middle button’s hold let go: nothing run, still open',
      [ran, menu.isOpen()],
      [[], true]
    );

    menu.close();
  }

  // The browser taking a press to scroll the menu chooses nothing.
  {
    const ran: string[] = [],
      menu = menuOf({}, ran),
      [one] = rows(menu);

    underPointer = one;
    pointer('pointermove');
    pointer('pointerdown', one);
    pointer('pointercancel');
    expect(
      'scrolling: nothing pressed, hovered or run, and still open',
      [one.hasAttribute('data-pressed'), hovered(menu), ran, menu.isOpen()],
      [false, [], [], true]
    );

    menu.close();
  }

  // Kept in reach when the window changes: a phone turned leaves room for less.
  {
    const launcher = document.createElement('button'),
      viewport = window as unknown as {
        innerWidth: number;
        innerHeight: number;
      },
      { innerWidth, innerHeight } = viewport;

    document.body.append(launcher);
    launcher.getBoundingClientRect = () =>
      ({
        left: 700,
        right: 740,
        top: 10,
        bottom: 50,
        width: 40,
        height: 40,
      } as DOMRect);

    viewport.innerWidth = 800;
    viewport.innerHeight = 600;

    const menu = menuOf({
        launcher,
        anchor: { below: launcher.getBoundingClientRect() },
      }),
      element = menu.element();

    Object.defineProperty(element, 'offsetWidth', { value: 200 });
    Object.defineProperty(element, 'offsetHeight', { value: 300 });

    launcher.getBoundingClientRect = () =>
      ({
        left: 500,
        right: 540,
        top: 10,
        bottom: 50,
        width: 40,
        height: 40,
      } as DOMRect);
    viewport.innerWidth = 600;
    viewport.innerHeight = 300;
    window.dispatchEvent(new Event('resize'));

    expect(
      'resized: under the launcher where it is now, scrolling in the room left',
      [
        element.style.getPropertyValue('left'),
        element.style.getPropertyValue('max-height'),
      ],
      ['340px', `${300 - EDGE_MARGIN - 50 - LAUNCHER_GAP}px`]
    );

    menu.close();

    // Held, it isn't moved from under the press: it moves when the press is let go of.
    const held = menuOf({
        pressed: true,
        anchor: { point: { x: 100, y: 100 } },
      }),
      heldElement = held.element();

    Object.defineProperty(heldElement, 'offsetWidth', { value: 200 });
    Object.defineProperty(heldElement, 'offsetHeight', { value: 50 });

    const placedAt = heldElement.style.getPropertyValue('left');

    viewport.innerWidth = 250;
    window.dispatchEvent(new Event('resize'));
    expect(
      'resized under a held press: left where it is',
      heldElement.style.getPropertyValue('left'),
      placedAt
    );

    underPointer = null;
    pointer('pointerup');
    expect(
      'and placed once it’s let go of',
      heldElement.style.getPropertyValue('left'),
      `${250 - EDGE_MARGIN - 200 - 0}px`
    );

    held.close();
    launcher.remove();
    viewport.innerWidth = innerWidth;
    viewport.innerHeight = innerHeight;
  }

  // Only the main button (or a finger) runs a row.
  {
    const ran: string[] = [],
      menu = menuOf({}, ran),
      [one] = rows(menu);

    underPointer = one;
    pointer('pointermove');

    const rightDown = new Event('pointerdown', {
      bubbles: true,
      cancelable: true,
    });

    Object.assign(rightDown, { clientX: 10, clientY: 10, button: 2 });
    one.dispatchEvent(rightDown);
    expect(
      'the right button pressed on a row: not drawn pressed',
      one.hasAttribute('data-pressed'),
      false
    );

    const right = new Event('pointerup', { bubbles: true, cancelable: true });

    Object.assign(right, { clientX: 10, clientY: 10, button: 2 });
    document.body.dispatchEvent(right);
    expect(
      'the right button lifted on a row: nothing run, still open',
      [ran, menu.isOpen()],
      [[], true]
    );

    menu.close();
  }

  // Space on the launcher or a row is cancelled through its keyup, on which some browsers click whatever has the focus
  //  by then: the launcher, or a confirm button the row's window focused.
  {
    const keyup = (name: string): Event => {
      const event = new Event('keyup', { bubbles: true, cancelable: true });

      Object.assign(event, { key: name });
      window.dispatchEvent(event);

      return event;
    };

    const launcher = document.createElement('button');

    document.body.append(launcher);

    const menu = menuOf({ launcher });

    Object.defineProperty(document, 'activeElement', {
      configurable: true,
      get: () => launcher,
    });
    key(' ');
    delete (document as any).activeElement;

    expect(
      'Space on the launcher: closed, and its keyup cancelled',
      [
        menu.isOpen(),
        keyup('a').defaultPrevented,
        keyup(' ').defaultPrevented,
        keyup(' ').defaultPrevented,
      ],
      [false, false, true, false]
    );

    launcher.remove();

    const ran: string[] = [],
      chosen = menuOf({ byKeyboard: true }, ran);

    key(' ');
    expect(
      'Space on a row: run, and its keyup cancelled',
      [ran, chosen.isOpen(), keyup(' ').defaultPrevented],
      [['One'], false, true]
    );
  }

  // The keys move the same hover.
  {
    const ran: string[] = [],
      menu = menuOf({ byKeyboard: true }, ran);

    expect('opened from the keyboard: the first row', hovered(menu), ['One']);

    key('ArrowDown');
    expect('down, past the disabled row', hovered(menu), ['Three']);

    key('ArrowDown');
    key('ArrowDown');
    expect('round the end', hovered(menu), ['One']);

    key('ArrowUp');
    expect('up, round the start', hovered(menu), ['Quit']);

    key('Home');
    key('End');
    expect('Home and End', hovered(menu), ['Quit']);

    underPointer = rows(menu)[2];
    pointer('pointermove');
    expect('the pointer takes the hover from the keys', hovered(menu), [
      'Three',
    ]);

    // linkedom runs no capture phase, so which listener goes first can't be shown here: in a browser the menu's, on the
    //  window, goes before the game's, on the document. What's shown is which keys the menu keeps from the game.
    const enter = key('Enter');

    expect(
      'Enter runs the hovered row, and is the menu’s alone',
      [ran, menu.isOpen(), enter.defaultPrevented],
      [['Three'], false, true]
    );

    const other = menuOf();

    key('ArrowDown');

    const f4 = key('F4');

    expect(
      'another key closes it, and is left to the game',
      [other.isOpen(), f4.defaultPrevented],
      [false, false]
    );

    const loose = menuOf(),
      space = key(' ');

    expect(
      'Space with nothing chosen: closed, and kept from the game',
      [loose.isOpen(), space.defaultPrevented],
      [false, true]
    );

    const held = menuOf();

    key('Control');
    key('Alt');
    expect('a modifier on its own leaves it open', held.isOpen(), true);
    held.close();

    const escaped = menuOf(),
      escape = key('Escape');

    expect(
      'Escape closes it, and is the menu’s alone',
      [escaped.isOpen(), escape.defaultPrevented],
      [false, true]
    );
  }

  // Slide to choose, from the press that opened it.
  {
    const ran: string[] = [],
      held = menuOf({ pressed: true }, ran);

    underPointer = null;
    pointer('pointerup');
    expect(
      'lifted where it opened: it stays, for a tap',
      [held.isOpen(), ran],
      [true, []]
    );

    held.close();

    const slid = menuOf({ pressed: true }, ran);

    underPointer = rows(slid)[2];
    pointer('pointermove');
    expect('slid onto a row: it’s hovered', hovered(slid), ['Three']);

    pointer('pointerup');
    expect('lifted there: it runs', [ran, slid.isOpen()], [['Three'], false]);

    const off = menuOf({ pressed: true }, ran);

    underPointer = rows(off)[0];
    pointer('pointermove');
    underPointer = null;
    pointer('pointermove');
    pointer('pointerup');
    expect(
      'slid off the rows and lifted: closed, nothing run',
      [ran, off.isOpen()],
      [['Three'], false]
    );
  }

  // One at a time, and a window opening closes it.
  {
    const first = menuOf(),
      second = menuOf();

    expect(
      'a second closes the first',
      [first.isOpen(), second.isOpen()],
      [false, true]
    );

    {
      const dialog = document.createElement('dialog');

      const ghost = document.createElement('div');

      ghost.className = 'window ui-window-ghost';
      document.body.append(ghost);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect('a closing window’s ghost: still open', second.isOpen(), true);
      ghost.remove();

      dialog.className = 'window';
      document.body.append(dialog);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect('a window opening closes it', second.isOpen(), false);
      dialog.remove();
    }
  }

  // The Game menu: under the new interface its button toggles the menu.
  {
    applyInterface('new', null);

    const holder = document.createElement('div');

    document.body.append(holder);

    const gameMenu = new GameMenu(
      holder,
      () => ({ civilization: { _: 'Roman' } } as any),
      () => 1,
      () => -4000,
      {} as any,
      { send: () => {} } as any
    );

    gameMenu.build();

    const button = holder.querySelector('button') as HTMLButtonElement,
      click = (detail: number) => {
        const event = new Event('click', { bubbles: true });

        Object.assign(event, { detail });
        button.dispatchEvent(event);
      };

    expect(
      'the button says it opens a menu',
      [
        button.getAttribute('aria-haspopup'),
        button.getAttribute('aria-expanded'),
        button.getAttribute('aria-label'),
      ],
      ['menu', 'false', 'Game menu']
    );

    click(1);

    const menu = openMenu()!;

    expect(
      'opened: game, reports with their keys, reference, then Retire and Quit',
      [
        Array.from(menu.element().querySelectorAll('.ui-menu-eyebrow')).map(
          (eyebrow) => eyebrow.textContent
        ),
        rows(menu).map((row) => [
          row.querySelector('.ui-menu-label')!.textContent,
          row.querySelector('kbd')?.textContent ?? null,
          row.classList.contains('danger'),
        ]),
      ],
      [
        ['Reports', 'Reference'],
        [
          ['Save Game', 'Shift+S', false],
          ['Load Game', null, false],
          ['Options', null, false],
          ['City Status', 'F1', false],
          ['Military Report', 'F2', false],
          ['Intelligence Report', 'F3', false],
          ['Happiness Report', 'F4', false],
          ['Trade Report', 'F5', false],
          ['Science Report', 'F6', false],
          ['Top Cities in the World', 'F8', false],
          ['Civilization Score', 'F9', false],
          ['Civilopedia', '?', false],
          ['Retire', null, true],
          ['Quit', null, true],
        ],
      ]
    );
    expect('open', button.getAttribute('aria-expanded'), 'true');

    // As the browser does it: the press, which is the launcher's, then the click.
    underPointer = null;
    pointer('pointerdown', button);
    click(1);
    expect(
      'pressed again: closed (#710)',
      [menu.isOpen(), openMenu()],
      [false, null]
    );

    click(0);
    expect('from the keyboard: the first row hovered', hovered(openMenu()!), [
      'Save Game',
    ]);
    openMenu()!.close();

    gameMenu.enableCheats();
    click(1);
    expect(
      'with cheats on, their section',
      Array.from(
        openMenu()!.element().querySelectorAll('.ui-menu-eyebrow')
      ).map((eyebrow) => eyebrow.textContent),
      ['Reports', 'Reference', 'Cheats']
    );
    openMenu()!.close();

    holder.remove();
  }

  // The classic Game menu: a second press closes it, rather than opening it again (#710).
  {
    applyInterface('classic', null);

    const holder = document.createElement('div');

    document.body.append(holder);

    const gameMenu = new GameMenu(
      holder,
      () => ({ civilization: { _: 'Roman' } } as any),
      () => 1,
      () => -4000,
      {} as any,
      { send: () => {} } as any
    );

    gameMenu.build();

    const button = holder.querySelector('button') as HTMLButtonElement,
      press = () => {
        pointer('pointerdown', button);
        pointer('pointerup', button);
        button.dispatchEvent(new Event('click', { bubbles: true }));
      },
      shown = () =>
        Array.from(document.querySelectorAll('.popup-menu')).filter(
          (menu) => !menu.classList.contains('hide')
        ).length;

    press();
    expect('pressed: open', shown(), 1);

    press();
    expect('pressed again: closed', shown(), 0);

    press();
    expect('and again: open', shown(), 1);

    pointer('pointerup', document.body);
    holder.remove();
  }

  // The long press menu.
  {
    applyInterface('new', null);

    const grassland = {
        id: 'Tile-1',
        x: 1,
        y: 1,
        terrain: { _: 'Grassland', features: [] },
      } as unknown as Tile,
      hills = {
        id: 'Tile-2',
        x: 2,
        y: 1,
        terrain: { _: 'Hills', features: [] },
      } as unknown as Tile,
      ocean = {
        id: 'Tile-3',
        x: 9,
        y: 9,
        terrain: { _: 'Ocean', features: [] },
      } as unknown as Tile,
      action = (name: string, to: Tile): UnitAction =>
        ({
          _: name,
          __: [],
          id: `${name}-${to.id}`,
          from: grassland,
          to,
        } as UnitAction),
      unit = {
        _: 'Settlers',
        id: 'Unit-1',
        tile: grassland,
        player: {
          id: 'Player-1',
          civilization: {
            _: 'Roman',
            attributes: [{ name: 'colors', value: ['#fff', '#000'] }],
          },
        },
        status: { _: 'Active' },
        actions: [
          action('Fortify', grassland),
          action('FoundCity', grassland),
          action('Disband', grassland),
        ],
        actionsForNeighbours: { e: [action('Move', hills)] },
        routeOrders: [],
      } as unknown as Unit,
      sent: unknown[] = [],
      transport = { send: (...args: unknown[]) => sent.push(args) } as any,
      noDraw = () => {};

    const own = openUnitMenu(100, 100, unit, grassland, transport, {
      pressed: true,
      draw: noDraw,
    })!;

    expect(
      'on its own square: the unit, the square, and its orders with keys',
      [
        own.element().querySelector('.ui-menu-name')?.textContent,
        own.element().querySelector('.ui-menu-square')?.textContent,
        rows(own).map((row) => [
          row.querySelector('.ui-menu-label')!.textContent,
          row.querySelector('kbd')?.textContent ?? null,
          row.querySelector('canvas') !== null,
        ]),
      ],
      [
        'Settlers',
        'Grassland',
        [
          ['Fortify', 'f', true],
          ['Found a new city', 'b', true],
          ['Disband', 'Shift+D', true],
        ],
      ]
    );

    underPointer = rows(own)[1];
    pointer('pointermove');
    pointer('pointerup');
    expect('slid onto Found City and lifted: sent', sent, [
      [
        'action',
        {
          name: 'ActiveUnit',
          id: 'Unit-1',
          unitAction: 'FoundCity',
          target: 'Tile-1',
        },
      ],
    ]);

    const neighbour = openUnitMenu(100, 100, unit, hills, transport, {
      draw: noDraw,
    })!;

    expect(
      'a neighbour: which way it is, and no keys',
      [
        neighbour.element().querySelector('.ui-menu-square')?.textContent,
        rows(neighbour).map((row) => row.querySelector('kbd')),
      ],
      ['Hills · E', [null]]
    );
    neighbour.close();

    const distant = openUnitMenu(100, 100, unit, ocean, transport, {
      draw: noDraw,
    })!;

    expect(
      'a distant square: Go to',
      [
        distant.element().querySelector('.ui-menu-square')?.textContent,
        rows(distant).map(
          (row) => row.querySelector('.ui-menu-label')!.textContent
        ),
      ],
      ['Ocean', ['Go to']]
    );
    distant.close();

    expect(
      'no actions yet: no menu',
      openUnitMenu(
        100,
        100,
        { ...unit, actions: undefined } as unknown as Unit,
        grassland,
        transport,
        { draw: noDraw }
      ),
      null
    );
    expect(
      'a direction it has no word for',
      squareLine(hills, 'up'),
      'Hills · UP'
    );

    applyInterface('classic', null);
  }

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL ui-menu: ${failures.length} of ${checks} checks\n  ${failures.join(
        '\n  '
      )}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS ui-menu: ${checks} checks\n`);
  process.exit(0);
})();
