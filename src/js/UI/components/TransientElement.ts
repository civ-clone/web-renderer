import { CustomEventMap, Element, s } from '@dom111/element';

export interface ITransientElement {
  display(): void;
  parent(): HTMLElement;
}

export class TransientElement<
    T extends HTMLElement = HTMLElement,
    M extends CustomEventMap = CustomEventMap
  >
  extends Element<T, M>
  implements ITransientElement
{
  #parent: HTMLElement;

  constructor(parent: HTMLElement, element: T = s('<div></div>')) {
    super(element);

    // capture keys in the notification window
    this.on('keydown', (event: KeyboardEvent) => {
      event.stopPropagation();
    });

    this.element().setAttribute('tabindex', '0');

    this.#parent = parent;
  }

  build(): void {}

  display(): void {
    this.build();

    this.#parent.append(this.element());
  }

  parent(): HTMLElement {
    return this.#parent;
  }
}

export default TransientElement;
