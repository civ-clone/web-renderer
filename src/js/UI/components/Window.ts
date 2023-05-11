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

type WindowPosition = {
  x: number;
  y: number;
};

export type WindowSettings = {
  autoDisplay: boolean;
  autofocus: boolean;
  canClose: boolean;
  canMaximise: boolean;
  canResize: boolean;
  classes: string | string[];
  modal: boolean;
  parent: HTMLElement;
  position: WindowPosition | 'auto';
  size: WindowSize | 'auto' | 'maximised';
};

export type WindowOptions = { [K in keyof WindowSettings]?: WindowSettings[K] };

const defaultOptions: WindowSettings = {
  autoDisplay: true,
  autofocus: true,
  canClose: true,
  canMaximise: false,
  canResize: false,
  classes: '',
  modal: false,
  parent: document.body,
  position: 'auto',
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

    if (this.options.position === 'auto') {
      this.addClass('position-auto');
    }

    if (this.options.position !== 'auto') {
      (
        [
          ['x', 'left'],
          ['y', 'top'],
        ] as ['x' | 'y', 'left' | 'top'][]
      ).forEach(([axis, property]) => {
        this.element().style[property] =
          Math.min(
            0,
            Math.max(
              document.body.clientHeight - 20,
              (this.options.position as WindowPosition)[axis]
            )
          ) + 'px';
      });
    }

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
      if (event.key === 'Escape' && this.options.canClose) {
        this.close();
      }

      // Capture all keypresses whilst this is focused
      event.stopPropagation();
    });
  }

  close(): void {
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
    super.display();

    this.bindClose();

    if (this.options.modal) {
      this.element().showModal();
    } else {
      this.element().show();
    }

    if (!focus) {
      return;
    }

    this.element().focus();
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

  update(content: string | Node): void {
    this.element().lastElementChild?.remove();

    this.append(content instanceof Node ? content : s(`<p>${content}</p>`));
  }
}

export default Window;
