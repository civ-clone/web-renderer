import { TransientElement, ITransientElement } from './TransientElement';
import { off, on, s } from '@dom111/element';
import { Coordinate } from '../types';
import { button } from '../lib/button';
import eyebrowFor from '../lib/windowEyebrows';
import { glyph } from '../lib/glyphs';
import { h } from '../lib/html';
import interfaceMode from '../lib/interfaceMode';
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
  // The line over the title in the new chrome (#738): what kind of window, and its key. By default from its classes.
  eyebrow: string | null;
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
  eyebrow: null,
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
  // The new chrome (#738), behind the interface flag (#735): read once, as the window is made.
  #newChrome: boolean = interfaceMode() === 'new';
  // What had focus as the window opened, to have it back as it closes (#738).
  #opener: HTMLElement | null = null;
  // What the new chrome moved out of the body into its footer, and where from: put back before the window is built
  //  again, so the body it's built from is whole (#738).
  #adopted: [Element, Element][] = [];
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

    if (this.#newChrome) {
      this.addClass('ui-window');
      this.#bindNewKeys();
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
    this.#restoreAdopted();
    this.empty();

    if (this.#newChrome) {
      this.#buildNew();

      return;
    }

    const headerActions = this.#headerActions();

    this.append(
      this.#draggable(
        s(`<header><h3>${this.#title}</h3></header>`, ...headerActions)
      ),
      s(
        '<div class="body"></div>',
        this.#body instanceof Node ? this.#body : s(`<p>${this.#body}</p>`)
      )
    );
  }

  // The title bar's buttons: maximise and close, where the window can.
  #headerActions(): HTMLElement[] {
    return (
      [
        [
          this.options.canMaximise,
          h(
            s(
              `<button class="btn-icon maximise" aria-label="${t(
                'Window.maximize'
              )}">${glyph('maximise')}${glyph('minimise')}</button>`
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
              `<button class="btn-icon close" aria-label="${t(
                'Window.close'
              )}">${glyph('close')}</button>`
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
  }

  // A title bar that moves the window when dragged, and maximises it when double-clicked.
  #draggable(header: HTMLElement): HTMLElement {
    let isDragging = false;

    return h(header, {
      dblclick: () => this.maximise(),
      mousedown: (event) => {
        if (event.target.closest('button')) {
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
    });
  }

  /**
   * The new chrome (#738): an eyebrow over the title, the body, which is the part that scrolls, and a footer with a
   *  hint and the window's actions, the primary last. A window's own footer, at the end of its body, is moved into it,
   *  so no window needs to know which chrome it's in; one with none gets a quiet Close.
   */
  #buildNew(): void {
    const eyebrow =
        this.options.eyebrow ??
        eyebrowFor(
          Array.isArray(this.options.classes)
            ? this.options.classes
            : `${this.options.classes}`.split(' ')
        ),
      titles = s(`<div class="ui-window-titles"><h3>${this.#title}</h3></div>`);

    if (eyebrow !== null) {
      const line = s('<p class="ui-window-eyebrow"></p>');

      line.textContent = eyebrow;
      titles.prepend(line);
    }

    this.append(
      this.#draggable(
        s(
          '<header class="ui-window-header"></header>',
          titles,
          ...this.#headerActions()
        )
      ),
      s(
        '<div class="body"></div>',
        this.#body instanceof Node ? this.#body : s(`<p>${this.#body}</p>`)
      ),
      s(
        '<footer class="ui-window-footer"><p class="ui-window-hint"></p><div class="ui-window-actions"></div></footer>'
      )
    );

    this.#adoptFooter();
  }

  // Moves the body's own footer (one that holds only buttons), or the primary button the body ends in, into the
  //  chrome's. The footer itself moves, so a window that keeps it and adds to it later still has it. What it then
  //  holds is put in order, and the hint written, once the window has finished building (#738).
  #adoptFooter(): void {
    const footer = this.element().querySelector(':scope > .ui-window-footer'),
      actions = footer?.querySelector('.ui-window-actions');

    if (!footer || !actions) {
      return;
    }

    const own = Array.from(
        this.element().querySelectorAll(
          ':scope > .body > footer:last-child, :scope > .body > :last-child > footer:last-child'
        )
      ).find((candidate) =>
        // Buttons, or nothing yet: not a footer of words.
        Array.from(candidate.childNodes).every((node) =>
          node instanceof Element
            ? node.matches('button')
            : !node.textContent?.trim()
        )
      ),
      lone = this.element().querySelector(
        ':scope > .body > button.btn-primary:last-child, :scope > .body > :last-child > button.btn-primary:last-child'
      );

    this.#adopted = [own, lone]
      .filter((item): item is Element => item !== null && item !== undefined)
      .map((item) => [item, item.parentElement!]);

    // A body drawn again brings its own buttons, or none: what the last one gave goes either way.
    actions.replaceChildren(
      ...([own, lone].filter(
        (item) => item !== null && item !== undefined
      ) as Element[])
    );

    queueMicrotask(() => this.#settleFooter());
  }

  #restoreAdopted(): void {
    this.#adopted.forEach(([element, parent]) => parent.append(element));
    this.#adopted = [];
  }

  // The footer's buttons in order, the quiet first and the primary last, focus kept where it was, a quiet Close where
  //  there are none, and the hint of what Enter and Escape do.
  #settleFooter(): void {
    const footer = this.element().querySelector(':scope > .ui-window-footer'),
      actions = footer?.querySelector(
        '.ui-window-actions'
      ) as HTMLElement | null;

    if (!footer || !actions) {
      return;
    }

    const rank = (element: Element) =>
        element.classList.contains('btn-quiet')
          ? 0
          : element.classList.contains('btn-primary')
          ? 2
          : 1,
      focused = document.activeElement;

    [
      actions,
      ...Array.from(actions.querySelectorAll(':scope > footer')),
    ].forEach((holder) => {
      const buttons = Array.from(holder.children).filter((child) =>
        child.matches('button')
      );

      buttons
        .sort((a, b) => rank(a) - rank(b))
        .forEach((button) => holder.append(button));
    });

    // Moving a button takes focus off it.
    if (focused instanceof HTMLElement && actions.contains(focused)) {
      focused.focus();
    }

    // The window's own footer before its lone primary, which goes last.
    const lone = actions.querySelector(':scope > button.btn-primary');

    if (lone) {
      actions.append(lone);
    }

    actions.querySelector(':scope > .ui-window-close')?.remove();

    if (!actions.querySelector('button') && this.options.canClose) {
      actions.append(
        h(
          button(t('Window.close'), {
            variant: 'quiet',
            hotkey: 'Escape',
            className: 'ui-window-close',
          }),
          {
            click: () => this.close(),
          }
        )
      );
    }

    const primary = actions.querySelector('.btn-primary')?.textContent?.trim(),
      cancel = actions
        .querySelector('[aria-keyshortcuts="Escape"]')
        ?.textContent?.trim(),
      hint = footer.querySelector('.ui-window-hint') as HTMLElement;

    hint.textContent =
      primary || cancel
        ? t('Window.hint', {
            primary,
            cancel,
            context:
              primary && cancel ? 'both' : primary ? 'primary' : 'cancel',
            interpolation: { escapeValue: false },
          })
        : '';
  }

  // Enter runs the primary action, unless it's pressed on something that takes Enter itself. Caught on the way in,
  //  before a window's own keys, which close it on Enter (#738).
  #bindNewKeys(): void {
    this.element().addEventListener(
      'keydown',
      (event: KeyboardEvent) => {
        if (
          event.key !== 'Enter' ||
          event.repeat ||
          event.isComposing ||
          (event.target instanceof Element &&
            event.target !== this.element() &&
            event.target.closest(
              'button, a[href], input, select, textarea, summary, [contenteditable], [role="button"]'
            ))
        ) {
          return;
        }

        const primary = this.element().querySelector(
          ':scope > .ui-window-footer .btn-primary'
        ) as HTMLButtonElement | null;

        if (!primary || primary.disabled || primary.closest('[hidden]')) {
          return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();

        primary.click();
      },
      true
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

    if (this.#newChrome) {
      this.#fadeOut();
    }

    this.element().close();
    this.remove();

    this.emit(new CustomEvent('close'));

    if (this.#newChrome) {
      const active = document.activeElement;

      // Something has focus already: the window that closing this one opened (the next notice).
      if (
        active instanceof HTMLElement &&
        active !== document.body &&
        active.isConnected
      ) {
        return;
      }

      // Back to what had focus as it opened, where that can take it (#738); not behind a modal window, say.
      this.#opener?.focus();

      if (this.#opener !== null && document.activeElement === this.#opener) {
        return;
      }
    }

    const windows = document.querySelectorAll('dialog.window');

    if (!windows.length) {
      return;
    }

    (windows[windows.length - 1] as HTMLDialogElement).focus();
  }

  display(focus = this.options.autofocus): void {
    this.#closed = false;

    // Once: shown again, it would find its own focus.
    if (this.#newChrome && this.#opener === null) {
      const active = document.activeElement;

      this.#opener =
        active instanceof HTMLElement &&
        active !== document.body &&
        !this.element().contains(active)
          ? active
          : null;
    }

    super.display();

    this.bindClose();

    this.showDialog();

    if (!focus) {
      return;
    }

    this.element().focus();
  }

  // The window closes at once; a copy of it, which takes no input, fades in its place (#738).
  #fadeOut(): void {
    if (
      !this.element().isConnected ||
      this.hasClass('maximised') ||
      // A copy of a canvas is blank.
      this.element().querySelector('canvas') ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    ) {
      return;
    }

    const box = this.element().getBoundingClientRect(),
      ghost = this.element().cloneNode(true) as HTMLElement,
      shell = document.createElement('div');

    // Not a second element of the same id, nor anything that can take focus.
    [ghost, ...Array.from(ghost.querySelectorAll('[id], [for]'))].forEach(
      (element) => {
        element.removeAttribute('id');
        element.removeAttribute('for');
      }
    );
    shell.setAttribute('inert', '');
    // Drawn as the window was, where it was: without the classes that place it or lift it into a stacking order.
    shell.className = [
      ...Array.from(this.element().classList).filter(
        (name) => !['modal', 'position-auto'].includes(name)
      ),
      'ui-window-ghost',
    ].join(' ');
    shell.setAttribute('aria-hidden', 'true');
    shell.style.left = `${box.left}px`;
    shell.style.top = `${box.top}px`;
    shell.style.width = `${box.width}px`;
    shell.style.height = `${box.height}px`;
    shell.append(...Array.from(ghost.childNodes));
    shell.addEventListener('animationend', () => shell.remove());
    document.body.append(shell);

    // Gone even where the animation never runs.
    setTimeout(() => shell.remove(), 200);
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

    const heading = this.element().querySelector(':scope > header h3');

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

    if (this.#newChrome) {
      this.#adoptFooter();
    }
  }
}

export default Window;
