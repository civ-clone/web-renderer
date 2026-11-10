import { TransientElement, ITransientElement } from './TransientElement';
import { s } from '@dom111/element';
import { glyph } from '@civ-clone/ui-platform/lib/glyphs';
import { h } from '@civ-clone/ui-widgets/lib/html';
import { t } from 'i18next';
import windowChrome, { WindowChrome } from './windowChrome';

// Where on the page, in pixels, or by how far to move.
type Position = { x: number; y: number };

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
  // The line over the title in a chrome that shows one (#738): what kind of window, and its key. By default from its
  //  classes.
  eyebrow: string | null;
  modal: boolean;
  parent: HTMLElement;
  size: WindowSize | 'auto' | 'maximised';
};

export type WindowOptions = { [K in keyof WindowSettings]?: WindowSettings[K] };

// How much of a title bar stays on the page, in px, when its window is dragged off the side (#858): enough to take hold
//  of with a finger.
const TITLE_BAR_GRIP = 64;

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
  // The keys are bound the first time the window is shown, and stay bound: bound again each time, a window shown
  //  twice answered one Escape twice, running its cancel twice (#869).
  #closeBound: boolean = false;
  #title: string;
  // What the window looks like around its body, which the interface says (#860): chosen once, as the window is made.
  #chrome: WindowChrome = windowChrome.current()({
    element: () => this.element(),
    settings: () => this.options,
    title: () => this.#title,
    body: () =>
      s(
        '<div class="body"></div>',
        this.#body instanceof Node ? this.#body : s(`<p>${this.#body}</p>`)
      ),
    headerActions: () => this.#headerActions(),
    draggable: (header) => this.#draggable(header),
    close: () => this.close(),
  });

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

    this.#chrome.attach();

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
    this.#chrome.building();
    this.empty();
    this.#chrome.build();
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

  // A title bar that moves the window when dragged, by a mouse, a finger or a pen (#858), and maximises it when
  //  double-clicked.
  #draggable(header: HTMLElement): HTMLElement {
    // The pointer dragging the bar, and where it was last seen.
    let dragging: { id: number; x: number; y: number } | null = null;

    const stop = (event: PointerEvent): void => {
      if (dragging === null || event.pointerId !== dragging.id) {
        return;
      }

      dragging = null;

      if (header.hasPointerCapture?.(event.pointerId)) {
        header.releasePointerCapture(event.pointerId);
      }
    };

    return h(header, {
      dblclick: () => this.maximise(),
      pointerdown: (event: PointerEvent) => {
        // The main button of the main pointer, and not on one of the bar's own buttons. A maximised window stays
        //  where it is: moved, it would jump there when next restored.
        if (
          this.hasClass('maximised') ||
          event.isPrimary === false ||
          (event.button ?? 0) !== 0 ||
          (event.target as Element).closest('button')
        ) {
          return;
        }

        dragging = { id: event.pointerId, x: event.clientX, y: event.clientY };

        // Held, so the drag goes on when the pointer leaves the bar or the page.
        header.setPointerCapture?.(event.pointerId);
      },
      pointermove: (event: PointerEvent) => {
        if (dragging === null || event.pointerId !== dragging.id) {
          return;
        }

        this.move({
          x: event.clientX - dragging.x,
          y: event.clientY - dragging.y,
        });

        dragging.x = event.clientX;
        dragging.y = event.clientY;
      },
      pointerup: stop,
      pointercancel: stop,
      // Let go where the page never heard of it: another app taken to the front mid-drag, say.
      lostpointercapture: stop,
    });
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

    this.#chrome.closing();

    this.element().close();
    this.remove();

    this.emit(new CustomEvent('close'));

    if (this.#chrome.closed()) {
      return;
    }

    const windows = document.querySelectorAll('dialog.window');

    if (!windows.length) {
      return;
    }

    (windows[windows.length - 1] as HTMLDialogElement).focus();
  }

  display(focus = this.options.autofocus): void {
    this.#closed = false;

    this.#chrome.opening();

    super.display();

    if (!this.#closeBound) {
      this.#closeBound = true;

      this.bindClose();
    }

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

  move({ x, y }: Position): void {
    if (this.hasClass('position-auto')) {
      // Ensure the auto position is accounted for
      x += this.element().offsetLeft;
      y += this.element().offsetTop;

      this.removeClass('position-auto');

      this.#place({ x, y });

      return;
    }

    // Where it was last put, which is on the element itself once it has been moved. To the fraction of a pixel: a
    //  finger or a pen moves by less than one at a time, and many of those add up.
    const style = this.element().style,
      current = (side: 'top' | 'left'): number =>
        parseFloat(
          style.getPropertyValue(side) ||
            getComputedStyle(this.element()).getPropertyValue(side)
        );

    this.#place({ x: current('left') + x, y: current('top') + y });
  }

  // Puts the window's corner as near `x`, `y` as leaves its title bar in reach (#858): never above the top of the page
  //  or below its foot, and with a grip's width of it on the page at either side. The bar's own buttons, at its far
  //  end, are no grip, so that much more of it stays when it goes off the near side. A page with no size keeps it as
  //  asked.
  #place({ x, y }: Position): void {
    const width = this.element().offsetWidth,
      header = this.element().querySelector<HTMLElement>(':scope > header'),
      firstButton = header?.querySelector<HTMLElement>(':scope > button'),
      buttons =
        header && firstButton ? header.offsetWidth - firstButton.offsetLeft : 0,
      within = (value: number, least: number, most: number): number =>
        Number.isFinite(least) && Number.isFinite(most)
          ? Math.min(Math.max(value, least), Math.max(least, most))
          : value;

    this.element().style.setProperty(
      'top',
      within(y, 0, window.innerHeight - (header?.offsetHeight ?? 0)) + 'px'
    );
    this.element().style.setProperty(
      'left',
      within(
        x,
        TITLE_BAR_GRIP + (Number.isFinite(buttons) ? buttons : 0) - width,
        window.innerWidth - TITLE_BAR_GRIP
      ) + 'px'
    );
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

    this.#chrome.updated();
  }
}

export default Window;
