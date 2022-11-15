import { e, h, t } from '../lib/html';
import TransientElement, { ITransientElement } from './TransientElement';

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

export class Window extends TransientElement implements IWindow {
  private options: WindowSettings;
  #body: string | Node;
  #title: string;

  constructor(title: string, body: string | Node, options: WindowOptions = {}) {
    super(options.parent ?? defaultOptions.parent, e('div.window'));

    this.options = {
      ...defaultOptions,
      ...options,
    };

    this.#body = body;
    this.#title = title;

    if (this.options.size === 'auto') {
      this.element().classList.add('size-auto');
    }

    if (this.options.size === 'maximised') {
      this.element().classList.add('maximised');
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
      this.element().classList.add('position-auto');
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

  public build(): void {
    this.empty();

    const headerActions: HTMLElement[] = (
      [
        [
          this.options.canMaximise,
          h(
            e(
              'button.maximise[aria-label="Maximise"]',
              t('Maximise'),
              e(
                'img.maximise[src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJmZWF0aGVyIGZlYXRoZXItbWF4aW1pemUiPjxwYXRoIGQ9Ik04IDNINWEyIDIgMCAwIDAtMiAydjNtMTggMFY1YTIgMiAwIDAgMC0yLTJoLTNtMCAxOGgzYTIgMiAwIDAgMCAyLTJ2LTNNMyAxNnYzYTIgMiAwIDAgMCAyIDJoMyI+PC9wYXRoPjwvc3ZnPg=="][alt="Maximise"]'
              ),
              e(
                'img.restore[src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJmZWF0aGVyIGZlYXRoZXItbWluaW1pemUiPjxwYXRoIGQ9Ik04IDN2M2EyIDIgMCAwIDEtMiAySDNtMTggMGgtM2EyIDIgMCAwIDEtMi0yVjNtMCAxOHYtM2EyIDIgMCAwIDEgMi0yaDNNMyAxNmgzYTIgMiAwIDAgMSAyIDJ2MyI+PC9wYXRoPjwvc3ZnPg=="][alt="Restore"]'
              )
            ),
            {
              click: () => this.maximise(),
            }
          ),
        ],
        [
          this.options.canClose,
          h(
            e(
              'button.close[aria-label="Close"]',
              t('Close'),
              e(
                'img[src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJmZWF0aGVyIGZlYXRoZXIteCI+PGxpbmUgeDE9IjE4IiB5MT0iNiIgeDI9IjYiIHkyPSIxOCI+PC9saW5lPjxsaW5lIHgxPSI2IiB5MT0iNiIgeDI9IjE4IiB5Mj0iMTgiPjwvbGluZT48L3N2Zz4="][alt="Close"]'
              )
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

    this.element().append(
      h(e('header', e('h3', t(this.#title)), ...headerActions), {
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

            const elementComputedStyle = getComputedStyle(this.element()),
              currentTop = parseInt(
                elementComputedStyle.getPropertyValue('top'),
                10
              ),
              currentLeft = parseInt(
                elementComputedStyle.getPropertyValue('left'),
                10
              );

            this.element().style.setProperty(
              'top',
              currentTop + event.movementY + 'px'
            );
            this.element().style.setProperty(
              'left',
              currentLeft + event.movementX + 'px'
            );
          };

          document.addEventListener('mousemove', moveHandler);

          document.addEventListener(
            'mouseup',
            () => {
              document.removeEventListener('mousemove', moveHandler);

              isDragging = false;
            },
            {
              once: true,
            }
          );
        },
      }),
      e(
        'div.body',
        this.#body instanceof Node ? this.#body : e('p', t(this.#body))
      )
    );

    this.element().addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape' && this.options.canClose) {
        this.close();
      }

      // Capture all keypresses whilst this is focused
      event.stopPropagation();
    });
  }

  public close(): void {
    this.element().remove();

    this.element().dispatchEvent(new CustomEvent('close'));
  }

  public display(focus = true): void {
    super.display();

    if (!focus) {
      return;
    }

    this.element().focus();
  }

  public maximise(): void {
    if (!this.options.canMaximise) {
      return;
    }

    this.element().classList.toggle('maximised');
  }

  public update(content: string | Node): void {
    this.element().lastElementChild!.remove();

    this.element().append(
      content instanceof Node ? content : e('p', t(content))
    );
  }
}

export default Window;
