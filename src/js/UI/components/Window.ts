import { TransientElement, ITransientElement } from './TransientElement';
import { off, on, s } from '@dom111/element';
import { Coordinate } from '../types';
import { h } from '../lib/html';
import { t } from 'i18next';

export interface IWindow extends ITransientElement {
  close(): void;
  maximise(): void;
}

type WindowSize = {
  height: number | string;
  width: number | string;
};

export type WindowSettings = {
  autoDisplay: boolean;
  autofocus: boolean;
  canClose: boolean;
  canMaximise: boolean;
  canResize: boolean;
  // Run on Escape, whether or not the window can be closed: the window's own way out, such as a "Cancel" button's.
  cancel: (() => void) | null;
  classes: string | string[];
  modal: boolean;
  parent: HTMLElement;
  size: WindowSize | 'auto' | 'maximised';
};

export type WindowOptions = { [K in keyof WindowSettings]?: WindowSettings[K] };

const defaultOptions: WindowSettings = {
  autoDisplay: true,
  autofocus: true,
  canClose: true,
  canMaximise: false,
  canResize: false,
  cancel: null,
  classes: '',
  modal: false,
  parent: document.body,
  size: 'auto',
};

export class Window
  extends TransientElement<
    HTMLDialogElement,
    {
      close: [];
    }
  >
  implements IWindow
{
  private options: WindowSettings;
  #body: string | Node;
  // Closed and not shown since: a second `close()` does nothing.
  #closed: boolean = false;
  #title: string;

  constructor(title: string, body: string | Node, options: WindowOptions = {}) {
    super(
      options.parent ?? defaultOptions.parent,
      s<HTMLDialogElement>(
        `<dialog class="window"${
          options.autofocus ? ' autofocus' : ''
        }></dialog>`
      )
    );

    this.on('cancel', (event) => event.preventDefault());

    // The dialog's own `close`, not the one `close()` sends: the browser closed it without asking. Chromium does that,
    //  with no cancelable `cancel`, to an Escape it takes as a second close request in a row, which left a window that
    //  wasn't drawn but still took the keys (#351). One that can't be closed is shown again, and any other is closed
    //  properly. After `close()` the dialog has already gone, and listeners only ever hear `close()`'s own event.
    this.on('close', (event) => {
      // The `?debug=1` panel's "close open dialogs" means it: the native close goes to the listeners as it always did.
      if (event instanceof CustomEvent || this.element().dataset.forceClose) {
        return;
      }

      event.stopImmediatePropagation();

      if (!this.element().isConnected) {
        return;
      }

      if (!this.options.canClose) {
        this.showDialog();

        return;
      }

      this.close();
    });

    this.options = {
      ...defaultOptions,
      ...options,
    };

    this.#body = body;
    this.#title = title;

    if (this.options.modal) {
      this.addClass('modal');
    }

    if (this.options.size === 'auto') {
      this.addClass('size-auto');
    }

    if (this.options.size === 'maximised') {
      this.addClass('maximised');
    }

    if (this.options.size !== 'auto') {
      (['height', 'width'] as ('height' | 'width')[]).forEach((dimension) => {
        const value = (this.options.size as WindowSize)[dimension];

        if (typeof value === 'number') {
          this.element().style[dimension] = value + 'px';

          return;
        }

        this.element().style[dimension] = value;
      });
    }

    // Placed by the stylesheet until it is first moved.
    this.addClass('position-auto');

    if (this.options.classes) {
      this.addClass(
        ...(Array.isArray(this.options.classes)
          ? this.options.classes
          : [this.options.classes])
      );
    }

    if (this.options.autoDisplay) {
      this.display();

      return;
    }

    this.build();
  }

  build(): void {
    this.empty();

    const headerActions: HTMLElement[] = (
      [
        [
          this.options.canMaximise,
          h(
            s(
              `<button class="maximise" aria-label="${t(
                'Window.maximize'
              )}">${t('Window.maximize')}</button>`
            ),
            {
              click: () => this.maximise(),
            }
          ),
        ],
        [
          this.options.canClose,
          h(
            s(
              `<button class="close" aria-label="${t('Window.close')}">${t(
                'Window.close'
              )}</button>`
            ),
            {
              click: () => this.close(),
            }
          ),
        ],
      ] as [boolean, HTMLElement][]
    )
      .filter(([show]: [boolean, HTMLElement]) => show)
      .map(([, element]) => element);

    let isDragging = false;

    this.append(
      h(s(`<header><h3>${this.#title}</h3></header>`, ...headerActions), {
        dblclick: () => this.maximise(),
        mousedown: (event) => {
          if (event.target.matches('button, button img')) {
            return;
          }

          isDragging = true;

          const moveHandler = (event: MouseEvent) => {
            if (!isDragging) {
              return;
            }

            this.move({
              x: event.movementX,
              y: event.movementY,
            });
          };

          on(document, 'mousemove', moveHandler);

          on(
            document,
            'mouseup',
            () => {
              off(document, 'mousemove', moveHandler);

              isDragging = false;
            },
            {
              once: true,
            }
          );
        },
      }),
      s(
        '<div class="body"></div>',
        this.#body instanceof Node ? this.#body : s(`<p>${this.#body}</p>`)
      )
    );
  }

  bindClose(): void {
    this.on('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Or the browser closes the dialog too, and Chromium closes the next one along (#351).
        event.preventDefault();

        if (this.options.cancel) {
          this.options.cancel();
        } else if (this.options.canClose) {
          this.close();
        }
      }

      // Capture all keypresses whilst this is focused
      event.stopPropagation();
    });
  }

  close(): void {
    // Once is enough: a list chosen from closes itself, and the caller often closes it again from its choice, and its
    //  close listeners would run again (#599).
    if (this.#closed) {
      return;
    }

    this.#closed = true;

    this.element().close();
    this.remove();

    this.emit(new CustomEvent('close'));

    const windows = document.querySelectorAll('dialog.window');

    if (!windows.length) {
      return;
    }

    (windows[windows.length - 1] as HTMLDialogElement).focus();
  }

  display(focus = this.options.autofocus): void {
    this.#closed = false;

    super.display();

    this.bindClose();

    this.showDialog();

    if (!focus) {
      return;
    }

    this.element().focus();
  }

  private showDialog(): void {
    if (this.options.modal) {
      this.element().showModal();

      return;
    }

    this.element().show();
  }

  maximise(): void {
    if (!this.options.canMaximise) {
      return;
    }

    this.element().classList.toggle('maximised');

    this.emit(
      new CustomEvent('resize', {
        bubbles: false,
      })
    );
  }

  move({ x, y }: Coordinate): void {
    if (this.hasClass('position-auto')) {
      // Ensure the auto position is accounted for
      x += this.element().offsetLeft;
      y += this.element().offsetTop;

      this.removeClass('position-auto');

      this.element().style.setProperty('top', y + 'px');
      this.element().style.setProperty('left', x + 'px');

      return;
    }

    const elementComputedStyle = getComputedStyle(this.element()),
      currentTop = parseInt(elementComputedStyle.getPropertyValue('top'), 10),
      currentLeft = parseInt(elementComputedStyle.getPropertyValue('left'), 10);

    this.element().style.setProperty('top', currentTop + y + 'px');
    this.element().style.setProperty('left', currentLeft + x + 'px');
  }

  // The title as HTML, as the constructor takes it, for a window that shows something else now (#678).
  setTitle(title: string): void {
    this.#title = title;

    const heading = this.element().querySelector(':scope > header > h3');

    if (heading) {
      heading.innerHTML = title;
    }
  }

  // Replaces what's inside the `.body` wrapper, which stays so the body is still the part that scrolls (#283).
  update(content: string | Node): void {
    this.#body = content;

    this.element()
      .querySelector(':scope > .body')
      ?.replaceChildren(
        content instanceof Node ? content : s(`<p>${content}</p>`)
      );
  }
}

export default Window;
