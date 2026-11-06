// The new interface's menu (#808, #735): the Game menu and the unit's long press menu. One panel of rows in sections,
//  each row its icon, label, detail and key, and one hover, which is the selection: the row under the mouse, under a
//  finger sliding from the press that opened the menu, or moved to with the arrow keys, is the one that runs.
//
// The hover follows the pointer through `elementFromPoint` on the window's own pointer events, not CSS `:hover`: the
//  map holds the pointer from the press that opened the long press menu (`setPointerCapture`, #490), so the rows never
//  see that finger, and the browser never hovers them.
//
// Appended last to the body and so drawn over the map, the sidebar and the notifications by document order, with no
//  z-index. A window opened after it would be drawn over it, so the menu closes when one opens.

import { s } from '@dom111/element';

export interface UiMenuItem {
  label: string;
  action: () => void;
  /** The key that does the same, as the player presses it (`F1`, `Shift+S`), or nothing. */
  key?: string | null;
  icon?: HTMLElement | null;
  detail?: string | null;
  /** One that ends the game: drawn in the warning colour. */
  danger?: boolean;
  disabled?: boolean;
}

export interface UiMenuSection {
  heading?: string | null;
  /** A rule above the section. */
  rule?: boolean;
  items: UiMenuItem[];
}

/** Where the menu opens: under a launcher, its end lined up with the launcher's, or over a point (a press). */
export type UiMenuAnchor =
  | { below: DOMRectReadOnly | Box }
  | { point: { x: number; y: number } };

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface UiMenuOptions {
  /** What the menu is, for assistive technology. */
  label: string;
  sections: UiMenuSection[];
  anchor: UiMenuAnchor;
  /** Above the rows: the long press menu's unit and square. */
  header?: HTMLElement | null;
  /** The button that opened it: a press on it is its own (it toggles the menu), and focus goes back to it. */
  launcher?: HTMLElement | null;
  /** Opened from the keyboard: the hover starts on the first row, and the rows take the focus. */
  byKeyboard?: boolean;
  /** Opened by a press still held (a long press): lifting it on no row leaves the menu open. */
  pressed?: boolean;
  className?: string;
  onClose?: () => void;
}

// How far, in px, the menu keeps from the viewport's edges, and from the press it opens over: clear of the square
//  pressed, at the map's usual scale, and of the finger pressing it.
export const EDGE_MARGIN = 8,
  POINT_GAP = 24,
  LAUNCHER_GAP = 4;

/**
 * Where a menu of `size` goes, as `left`/`top` in the viewport and the height it may take before it scrolls. Under a
 *  launcher it opens downwards, its right edge on the launcher's; over a point it's centred above it, or below where
 *  there's no room above. Either way it's kept `EDGE_MARGIN` inside the viewport.
 */
export const placeMenu = (
  anchor: UiMenuAnchor,
  size: { width: number; height: number },
  viewport: { width: number; height: number }
): { left: number; top: number; maxHeight: number } => {
  const clampLeft = (left: number): number =>
      Math.max(
        EDGE_MARGIN,
        Math.min(left, viewport.width - EDGE_MARGIN - size.width)
      ),
    room = (top: number): number =>
      Math.max(0, viewport.height - EDGE_MARGIN - top);

  if ('below' in anchor) {
    const top = anchor.below.bottom + LAUNCHER_GAP;

    return {
      left: clampLeft(anchor.below.right - size.width),
      top,
      maxHeight: room(top),
    };
  }

  // A press from before a resize may be off the screen now.
  const { x } = anchor.point,
    y = Math.min(anchor.point.y, viewport.height - EDGE_MARGIN),
    left = clampLeft(x - size.width / 2),
    above = y - POINT_GAP - size.height;

  if (above >= EDGE_MARGIN) {
    return { left, top: above, maxHeight: y - POINT_GAP - EDGE_MARGIN };
  }

  const below = y + POINT_GAP,
    roomAbove = y - POINT_GAP - EDGE_MARGIN;

  // Taller than the room on either side: on whichever has more, scrolling.
  if (room(below) < size.height && roomAbove > room(below)) {
    return { left, top: EDGE_MARGIN, maxHeight: roomAbove };
  }

  return { left, top: below, maxHeight: room(below) };
};

// How long the menu takes to fade, in ms: the theme's `--ui-menu-motion`, which is 0s under Civ1 classic.
const fadeTime = (element: HTMLElement): number => {
  const value =
      typeof getComputedStyle === 'function'
        ? getComputedStyle(element).getPropertyValue('--ui-menu-motion').trim()
        : '',
    amount = parseFloat(value);

  if (!Number.isFinite(amount)) {
    return 0;
  }

  return value.endsWith('ms') ? amount : amount * 1000;
};

// Keeps the next click from anything: the one a browser sends after the lift that closed a menu, which would land on
//  what's under it, or on a window its row opened. Given up on if it doesn't come.
const swallowClick = (): void => {
  const swallow = (event: Event): void => {
      event.preventDefault();
      event.stopImmediatePropagation();
      done();
    },
    done = (): void => {
      window.removeEventListener('click', swallow, true);
      clearTimeout(timer);
    },
    timer = setTimeout(done, 500);

  window.addEventListener('click', swallow, true);
};

// Cancels Space's keyup, on which some browsers click the focused button whatever its keydown did. By then the focus
//  may be on the launcher, which would open the menu again, or on a window's confirm button, which would answer it
//  unasked.
const cancelSpaceUp = (): void => {
  const keyup = (event: KeyboardEvent): void => {
    if (event.key !== ' ') {
      return;
    }

    event.preventDefault();
    window.removeEventListener('keyup', keyup, true);
  };

  window.addEventListener('keyup', keyup, true);
};

// The menu open now: one at a time.
let open: UiMenu | null = null;

/** The menu open now, if any. */
export const openMenu = (): UiMenu | null => open;

export class UiMenu {
  #options: UiMenuOptions;
  #element: HTMLElement;
  #rows: HTMLButtonElement[] = [];
  #items: UiMenuItem[] = [];
  #hover: number | null = null;
  #pressed: boolean;
  #slid = false;
  #resized = false;
  #closed = false;
  #observer: MutationObserver | null = null;
  #listeners: [EventTarget, string, (event: any) => void][] = [];

  constructor(options: UiMenuOptions) {
    open?.close();
    open = this;

    this.#options = options;
    this.#pressed = options.pressed ?? false;
    this.#element = this.#build();

    document.body.append(this.#element);

    this.#place();
    this.#listen();

    options.launcher?.setAttribute('aria-expanded', 'true');

    if (options.byKeyboard) {
      this.#hoverRow(this.#next(-1, 1), true);
    }

    // Shown from the next frame, so it fades in.
    (globalThis.requestAnimationFrame ?? setTimeout)((): void => {
      if (!this.#closed) {
        this.#element.dataset.open = '';
      }
    });
  }

  element(): HTMLElement {
    return this.#element;
  }

  isOpen(): boolean {
    return !this.#closed;
  }

  /** The row hovered, by its label, or `null`. */
  hovered(): string | null {
    return this.#hover === null ? null : this.#items[this.#hover].label;
  }

  close({ restoreFocus = false }: { restoreFocus?: boolean } = {}): void {
    if (this.#closed) {
      return;
    }

    this.#closed = true;

    if (open === this) {
      open = null;
    }

    this.#listeners.forEach(([target, type, listener]) =>
      target.removeEventListener(type, listener, true)
    );
    this.#observer?.disconnect();

    const { launcher } = this.#options;

    launcher?.setAttribute('aria-expanded', 'false');

    if (restoreFocus || this.#element.contains(document.activeElement)) {
      launcher?.focus();
    }

    // Faded out, over the theme's time (none under Civ1 classic or reduced motion), then gone.
    delete this.#element.dataset.open;
    this.#element.inert = true;

    setTimeout((): void => this.#element.remove(), fadeTime(this.#element));

    this.#options.onClose?.();
  }

  #build(): HTMLElement {
    const { className, header, label, sections } = this.#options,
      menu = document.createElement('div');

    menu.className = ['ui-menu', className].filter(Boolean).join(' ');
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', label);

    if (header) {
      header.classList.add('ui-menu-header');
      menu.append(header);
    }

    const body = document.createElement('div');

    body.className = 'ui-menu-body';
    menu.append(body);

    sections
      .filter(({ items }) => items.length > 0)
      .forEach(({ heading, items, rule }) => {
        if (rule) {
          const separator = document.createElement('div');

          separator.className = 'ui-menu-rule';
          separator.setAttribute('role', 'separator');
          body.append(separator);
        }

        const group = document.createElement('div');

        group.className = 'ui-menu-section';
        group.setAttribute('role', 'group');

        if (heading) {
          const eyebrow = document.createElement('div');

          eyebrow.className = 'ui-menu-eyebrow';
          eyebrow.textContent = heading;
          eyebrow.setAttribute('aria-hidden', 'true');
          group.setAttribute('aria-label', heading);
          group.append(eyebrow);
        }

        items.forEach((item) => group.append(this.#row(item)));
        body.append(group);
      });

    return menu;
  }

  #row(item: UiMenuItem): HTMLButtonElement {
    const row = s<HTMLButtonElement>(
        '<button type="button" class="btn-bare ui-menu-item"></button>'
      ),
      index = this.#items.length;

    row.setAttribute('role', 'menuitem');
    row.tabIndex = -1;
    row.dataset.index = String(index);

    if (item.danger) {
      row.classList.add('danger');
    }

    if (item.disabled) {
      row.disabled = true;
      row.setAttribute('aria-disabled', 'true');
    }

    const icon = document.createElement('span');

    icon.className = 'ui-menu-icon';
    icon.setAttribute('aria-hidden', 'true');

    if (item.icon) {
      icon.append(item.icon);
    }

    const label = document.createElement('span');

    label.className = 'ui-menu-label';
    label.textContent = item.label;
    row.append(icon, label);

    if (item.detail) {
      const detail = document.createElement('span');

      detail.className = 'ui-menu-detail';
      detail.textContent = item.detail;
      row.append(detail);
    }

    if (item.key) {
      const key = document.createElement('kbd');

      key.className = 'ui-menu-key';
      key.textContent = item.key;
      key.setAttribute('aria-hidden', 'true');
      row.append(key);
      row.setAttribute('aria-keyshortcuts', item.key);
    }

    this.#rows.push(row);
    this.#items.push(item);

    return row;
  }

  #place(): void {
    const element = this.#element,
      { anchor, launcher } = this.#options,
      body = element.querySelector<HTMLElement>('.ui-menu-body')!,
      { scrollTop } = body;

    // Its full size, not the height it was last allowed.
    element.style.removeProperty('max-height');

    const { left, top, maxHeight } = placeMenu(
      // Where the launcher is now, which a resize can move.
      'below' in anchor && launcher
        ? { below: launcher.getBoundingClientRect() }
        : anchor,
      { width: element.offsetWidth, height: element.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight }
    );

    element.style.setProperty('left', `${left}px`);
    element.style.setProperty('top', `${top}px`);
    element.style.setProperty('max-height', `${maxHeight}px`);

    body.scrollTop = scrollTop;

    // A finger panning the rows is for a menu with more to show: otherwise it slides from row to row.
    body.toggleAttribute('data-scrolls', body.scrollHeight > body.clientHeight);
  }

  // Once any press is let go of: a resize doesn't move the menu from under one.
  #placeIfResized(): void {
    if (this.#resized) {
      this.#resized = false;
      this.#place();
    }
  }

  #listen(): void {
    const add = <E extends Event>(
      target: EventTarget,
      type: string,
      listener: (event: E) => void
    ): void => {
      target.addEventListener(type, listener as (event: Event) => void, true);
      this.#listeners.push([target, type, listener]);
    };

    // One pointer drives the menu: a second finger's press, slide or lift is nothing to it.
    add<PointerEvent>(window, 'pointermove', (event) => {
      if (event.isPrimary === false) {
        return;
      }

      const index = this.#rowAt(event.clientX, event.clientY);

      if (index !== null) {
        this.#slid ||= this.#pressed;
        this.#hoverRow(index);
      } else if (this.#hover !== null && !this.#hasFocus()) {
        // Off the rows, nothing is chosen, unless the keys moved the focus there.
        this.#hoverRow(null);
      }
    });

    add<PointerEvent>(window, 'pointerdown', (event) => {
      if (event.isPrimary === false) {
        return;
      }

      const target = event.target as Node | null;

      // The launcher's own: its click toggles the menu.
      if (target && this.#options.launcher?.contains(target)) {
        return;
      }

      if (target && this.#element.contains(target)) {
        const index = this.#rowAt(event.clientX, event.clientY);

        // Drawn pressed for the button that would run it.
        if (index !== null && (event.button ?? 0) === 0) {
          this.#hoverRow(index);
          this.#rows[index].dataset.pressed = '';
        }

        // Not the map's, nor the page's: a press in the menu is only the menu's.
        event.preventDefault();

        return;
      }

      this.close();
    });

    add<PointerEvent>(window, 'pointerup', (event) => {
      if (event.isPrimary === false) {
        return;
      }

      const held = this.#pressed;

      this.#pressed = false;
      this.#rows.forEach((row) => delete row.dataset.pressed);

      // The main button's, or a finger's: a right or middle button lifted on a row runs nothing. The right button's
      //  `contextmenu`, which some browsers send after it, would land on whatever is behind a closed menu.
      if ((event.button ?? 0) !== 0) {
        return;
      }

      const index = this.#rowAt(event.clientX, event.clientY);

      if (index !== null) {
        event.preventDefault();

        // The click this lift is about to send would find the menu gone, and land on what's under it, or on a window
        //  the row opens. A finger that slid here from the map's long press sends none.
        if (!held || event.pointerType === 'mouse') {
          swallowClick();
        }

        this.#run(index);

        return;
      }

      // The press that opened it, lifted on no row: slid off the rows, it's let go of; lifted where it opened, the
      //  menu stays for a tap.
      if (held && this.#slid) {
        this.close();

        return;
      }

      this.#placeIfResized();
    });

    // The browser taking the press for itself, to scroll a menu too tall for the screen: nothing is chosen.
    add<PointerEvent>(window, 'pointercancel', (event) => {
      if (event.isPrimary === false) {
        return;
      }

      this.#pressed = false;
      this.#rows.forEach((row) => delete row.dataset.pressed);

      if (!this.#hasFocus()) {
        this.#hoverRow(null);
      }

      this.#placeIfResized();
    });

    // A click with no pointer behind it: assistive technology's.
    add<MouseEvent>(this.#element, 'click', (event) => {
      if (event.detail !== 0) {
        return;
      }

      const row = (event.target as HTMLElement).closest?.('.ui-menu-item');

      if (row) {
        this.#run(Number((row as HTMLElement).dataset.index));
      }
    });

    // The map's own menu, under a right-click on the menu.
    add<MouseEvent>(this.#element, 'contextmenu', (event) =>
      event.preventDefault()
    );

    add<KeyboardEvent>(window, 'keydown', (event) => this.#key(event));

    // A phone turned, or a window resized: kept in reach, scrolling if it has to. Not moved from under a held press.
    add(window, 'resize', () => {
      this.#resized = true;

      if (!this.#pressed) {
        this.#placeIfResized();
      }
    });

    // The page losing focus, to another window or tab: not an element's blur, which this sees too as it listens in the
    //  capture phase (the launcher's, as the keys move the focus to the first row).
    add<FocusEvent>(window, 'blur', (event) => {
      if (!(event.target instanceof Node)) {
        this.close();
      }
    });

    // A window opened after the menu would be drawn over it.
    if (typeof MutationObserver !== 'undefined') {
      this.#observer = new MutationObserver((records): void => {
        if (
          records.some((record) =>
            Array.from(record.addedNodes).some(
              (node) =>
                node instanceof HTMLElement &&
                node !== this.#element &&
                // Not a closing window's fade-out ghost, which carries its classes (`Window`).
                !node.matches('.ui-window-ghost') &&
                (node.matches('dialog, .window') ||
                  node.querySelector?.('dialog, .window') !== null)
            )
          )
        ) {
          this.close();
        }
      });
      this.#observer.observe(document.body, { childList: true });
    }
  }

  #key(event: KeyboardEvent): void {
    const handled = (): void => {
      event.preventDefault();
      event.stopImmediatePropagation();

      if (event.key === ' ') {
        cancelSpaceUp();
      }
    };

    switch (event.key) {
      case 'ArrowDown':
        handled();
        this.#hoverRow(this.#next(this.#hover ?? -1, 1), true);

        return;

      case 'ArrowUp':
        handled();
        this.#hoverRow(this.#next(this.#hover ?? this.#rows.length, -1), true);

        return;

      case 'Home':
        handled();
        this.#hoverRow(this.#next(-1, 1), true);

        return;

      case 'End':
        handled();
        this.#hoverRow(this.#next(this.#rows.length, -1), true);

        return;

      case 'Enter':
      case ' ':
        if (this.#hover === null) {
          // Nothing chosen: the launcher's Enter, which would open it again, is the menu's.
          if (this.#options.launcher?.contains(document.activeElement)) {
            handled();
            this.close({ restoreFocus: true });

            return;
          }

          // Not the game's: over a menu, these answer the menu, and must not end the turn or give a unit its orders.
          handled();
          this.close();

          return;
        }

        handled();
        this.#run(this.#hover);

        return;

      case 'Escape':
        handled();
        this.close({ restoreFocus: true });

        return;

      case 'Tab':
        this.close();

        return;

      // A modifier on its own, before the key it goes with.
      case 'Shift':
      case 'Control':
      case 'Alt':
      case 'Meta':
      case 'CapsLock':
        return;
    }

    // Any other key does what it does anyway, a report's or a unit's, with the menu gone.
    this.close();
  }

  // The next row from `from` in `step`'s direction that can be chosen, round the ends.
  #next(from: number, step: 1 | -1): number | null {
    const count = this.#rows.length;

    for (let i = 1; i <= count; i++) {
      const index = (((from + step * i) % count) + count) % count;

      if (!this.#items[index].disabled) {
        return index;
      }
    }

    return null;
  }

  #rowAt(x: number, y: number): number | null {
    const element = document.elementFromPoint?.(x, y),
      row = element?.closest?.('.ui-menu-item') as HTMLElement | null;

    if (!row || !this.#element.contains(row)) {
      return null;
    }

    const index = Number(row.dataset.index);

    return this.#items[index]?.disabled ? null : index;
  }

  #hasFocus(): boolean {
    return this.#rows.some((row) => row === document.activeElement);
  }

  #hoverRow(index: number | null, focus: boolean = false): void {
    if (this.#hover !== null) {
      delete this.#rows[this.#hover].dataset.hover;
    }

    this.#hover = index;

    if (index === null) {
      return;
    }

    const row = this.#rows[index];

    row.dataset.hover = '';

    if (focus) {
      row.focus({ preventScroll: true });
    } else if (this.#hasFocus() && document.activeElement !== row) {
      // The pointer took over from the keys: the focus goes with the hover, so the two never part.
      row.focus({ preventScroll: true });
    }

    row.scrollIntoView?.({ block: 'nearest' });
  }

  #run(index: number): void {
    const item = this.#items[index];

    if (!item || item.disabled || this.#closed) {
      return;
    }

    this.close({ restoreFocus: this.#hasFocus() });
    item.action();
  }
}

export default UiMenu;
