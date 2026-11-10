import { Element, off, on, s } from '@dom111/element';
import { h } from '@civ-clone/ui-widgets/lib/html';
import { glyph } from '@civ-clone/ui-platform/lib/glyphs';
import { t } from 'i18next';

// WeakMap so a menu whose launcher is dropped without an explicit `remove()`
// doesn't stay pinned in this module-level registry for the page lifetime.
const menuMap = new WeakMap<object, PopupMenu>();

/** Whether `launcher` has a menu open (#710). */
export const hasPopupMenu = (launcher: object): boolean =>
  menuMap.has(launcher);

export interface PopupMenuAction {
  label: string;
  action: (menu: PopupMenu) => void;
}

export interface PopupMenuOptions {
  align: 'left' | 'center' | 'right';
  // Opened from the keyboard: the first item takes the focus, for the arrow keys to move (#853).
  byKeyboard: boolean;
  fullWidth: boolean;
  // What the menu is called, for assistive technology.
  label: string | null;
  // What opened it: given the focus back when the keyboard closes the menu.
  restoreFocus: HTMLElement | null;
  target: HTMLElement;
}

export class PopupMenu extends Element {
  #actions: PopupMenuAction[] = [];
  #launcher: object;
  #targetPointerUpListener: (event: PointerEvent) => void = () => {};
  #centerX: number;
  #centerY: number;
  // An item has run: a press's `pointerup` and a click with no pointer behind it must not both run one.
  #done = false;
  #options: PopupMenuOptions = {
    align: 'left',
    byKeyboard: false,
    fullWidth: false,
    label: null,
    restoreFocus: null,
    target: document.body,
  };

  constructor(
    launcher: any,
    centerX: number,
    centerY: number,
    actions: PopupMenuAction[],
    options: Partial<PopupMenuOptions> = {}
  ) {
    super(s(`<div class="popup-menu hide" role="menu"></div>`));

    if (menuMap.has(launcher)) {
      const existingMenu = menuMap.get(launcher)!;

      existingMenu.remove();
    }

    menuMap.set(launcher, this);

    this.#launcher = launcher;
    this.#actions = actions;
    this.#centerX = centerX;
    this.#centerY = centerY;
    this.#options = {
      ...this.#options,
      ...options,
    };

    this.build();
  }

  build() {
    const actions = this.#actions;

    if (actions.length === 0) {
      this.remove();

      return;
    }

    this.element().style.setProperty('left', this.#centerX + 'px');
    this.element().style.setProperty('top', this.#centerY + 'px');

    this.removeClass('hide');

    if (this.#options.label !== null) {
      this.element().setAttribute('aria-label', this.#options.label);
    }

    this.append(
      ...actions.map(({ action, label }) =>
        this.#item(
          s(`<button class="btn-bare" role="menuitem">${label}</button>`),
          () => action(this)
        )
      ),
      this.#item(
        s(
          `<button class="btn-bare close" role="menuitem" aria-label="${t(
            'Generic.close'
          )}">${glyph('close')}</button>`
        ),
        () => {}
      )
    );

    // The keys, while the focus is in the menu (#853). Kept from the game's own, which would move a unit.
    on(this.element(), 'keydown', (event: KeyboardEvent) => this.#key(event));

    this.addClass(this.#options.align);

    if (this.#options.fullWidth) {
      this.addClass('full-width');
    }

    this.#targetPointerUpListener = () => this.remove();

    on(this.#options.target, 'pointerup', this.#targetPointerUpListener);

    this.#options.target.append(this.element());

    if (this.#options.byKeyboard) {
      this.#items()[0]?.focus();
    }
  }

  // An item: run by a press on it, or by a click with no pointer behind it, which is Enter or Space on the focused
  //  item, or assistive technology's (#853). Then the menu closes.
  #item(button: HTMLElement, run: () => void): HTMLElement {
    const choose = (byKeyboard: boolean): void => {
      if (this.#done) {
        return;
      }

      this.#done = true;

      try {
        run();
      } finally {
        // Closed whatever became of it: an item that threw would otherwise leave a menu nothing in it can run.
        //  Chosen with the keys, the focus is on the item, which is about to go: back to what opened the menu, unless
        //  what ran took it (a window does). A press leaves the focus where it always did.
        this.#close(byKeyboard && this.#hasFocus());
      }
    };

    return h(button, {
      pointerup: () => choose(false),
      click: (event: MouseEvent) => {
        if (event.detail === 0) {
          choose(true);
        }
      },
    });
  }

  #items(): HTMLElement[] {
    return Array.from(this.element().querySelectorAll('button'));
  }

  #hasFocus(): boolean {
    return this.element().contains(document.activeElement);
  }

  #close(restoreFocus: boolean): void {
    this.remove();

    if (restoreFocus) {
      this.#options.restoreFocus?.focus();
    }
  }

  #key(event: KeyboardEvent): void {
    const items = this.#items(),
      current = items.indexOf(document.activeElement as HTMLElement),
      to = (index: number): void =>
        items[(index + items.length) % items.length]?.focus();

    switch (event.key) {
      case 'ArrowDown':
        to(current + 1);

        break;

      case 'ArrowUp':
        to(current === -1 ? -1 : current - 1);

        break;

      case 'Home':
        to(0);

        break;

      case 'End':
        to(-1);

        break;

      case 'Escape':
        this.#close(true);

        break;

      // The focused item's own: the browser clicks it. Only kept from the game, where they are orders. Not a key
      //  still held from opening the menu, though: its repeat would choose the first item, which then has the focus.
      case 'Enter':
      case ' ':
        if (event.repeat) {
          event.preventDefault();
        }

        event.stopPropagation();

        return;

      default:
        return;
    }

    event.preventDefault();
    event.stopPropagation();
  }

  override remove() {
    this.addClass('hide');

    setTimeout(() => {
      super.remove();
    }, 250);

    off(this.#options.target, 'pointerup', this.#targetPointerUpListener);

    if (menuMap.get(this.#launcher) === this) {
      menuMap.delete(this.#launcher);
    }
  }
}

export default PopupMenu;
