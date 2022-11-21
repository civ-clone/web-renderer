import { Element as BaseElement, CustomEventMap } from '@dom111/element';

export class Element<
  T extends HTMLElement = HTMLElement,
  M extends CustomEventMap = CustomEventMap
> extends BaseElement<T, M> {
  constructor(element: T) {
    super(element);
  }
}

export default Element;
