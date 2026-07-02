import { Element, off, on, s } from '@dom111/element';
import { h } from '../lib/html';
import { t } from 'i18next';

// WeakMap so a menu whose launcher is dropped without an explicit `remove()`
// doesn't stay pinned in this module-level registry for the page lifetime.
const menuMap = new WeakMap<object, PopupMenu>();

export interface PopupMenuAction {
  label: string;
  action: (menu: PopupMenu) => void;
}

export interface PopupMenuOptions {
  align: 'left' | 'center' | 'right';
  fullWidth: boolean;
  target: HTMLElement;
}

export class PopupMenu extends Element {
  #actions: PopupMenuAction[] = [];
  #launcher: object;
  #targetPointerUpListener: (event: PointerEvent) => void = () => {};
  #centerX: number;
  #centerY: number;
  #options: PopupMenuOptions = {
    align: 'left',
    fullWidth: false,
    target: document.body,
  };

  constructor(
    launcher: any,
    centerX: number,
    centerY: number,
    actions: PopupMenuAction[],
    options: Partial<PopupMenuOptions> = {}
  ) {
    super(s(`<div class="popup-menu hide"></div>`));

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

    this.append(
      ...actions.map(({ action, label }) => {
        const button = s(`<button>${label}</button>`);

        on(button, 'pointerup', () => {
          action(this);

          this.remove();
        });

        return button;
      }),
      h(
        s(
          `<button class="close" aria-label="${t(
            'Generic.close'
          )}">&times;</button>`
        ),
        {
          pointerup: () => this.remove(),
        }
      )
    );

    this.addClass(this.#options.align);

    if (this.#options.fullWidth) {
      this.addClass('full-width');
    }

    this.#targetPointerUpListener = () => this.remove();

    on(this.#options.target, 'pointerup', this.#targetPointerUpListener);

    this.#options.target.append(this.element());
  }

  remove() {
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
