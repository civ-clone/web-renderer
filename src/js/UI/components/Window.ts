import { TransientElement, ITransientElement } from './TransientElement';
import { off, on, s } from '@dom111/element';
import { Coordinate } from '../types';
import { h } from '../lib/html';

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
  canClose: boolean;
  canMaximise: boolean;
  canResize: boolean;
  parent: HTMLElement;
  position: WindowPosition | 'auto';
  size: WindowSize | 'auto' | 'maximised';
};

export type WindowOptions = { [K in keyof WindowSettings]?: WindowSettings[K] };

const defaultOptions: WindowSettings = {
  autoDisplay: true,
  canClose: true,
  canMaximise: false,
  canResize: false,
  parent: document.body,
  position: 'auto',
  size: 'auto',
};

export class Window
  extends TransientElement<
    HTMLDivElement,
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
      s<HTMLDivElement>('<div class="window"></div>')
    );

    this.options = {
      ...defaultOptions,
      ...options,
    };

    this.#body = body;
    this.#title = title;

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
              `<button class="maximise" aria-label="Maximise">Maximise</button>`
            ),
            {
              click: () => this.maximise(),
            }
          ),
        ],
        [
          this.options.canClose,
          h(s(`<button class="close" aria-label="Close">Maximise</button>`), {
            click: () => this.close(),
          }),
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

    this.on('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape' && this.options.canClose) {
        this.close();
      }

      // Capture all keypresses whilst this is focused
      event.stopPropagation();
    });
  }

  close(): void {
    this.remove();

    this.emit(new CustomEvent('close'));
  }

  display(focus = true): void {
    super.display();

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
    this.element().lastElementChild!.remove();

    this.append(content instanceof Node ? content : s(`<p>${content}</p>`));
  }
}

export default Window;
