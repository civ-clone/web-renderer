import { e } from '../lib/html';
import { Element, IElement } from './Element';

export interface ITransientElement extends IElement {
  display(): void;
  parent(): HTMLElement;
}

export class TransientElement extends Element implements ITransientElement {
  #parent: HTMLElement;

  constructor(parent: HTMLElement, element: HTMLElement = e('div')) {
    super(element);

    // capture keys in the notification window
    this.element().addEventListener('keydown', (event: KeyboardEvent) => {
      event.stopPropagation();
    });

    this.element().setAttribute('tabindex', '0');

    this.#parent = parent;
  }

  public display(): void {
    this.build();

    this.#parent.append(this.element());
  }

  public parent(): HTMLElement {
    return this.#parent;
  }
}

export default TransientElement;
