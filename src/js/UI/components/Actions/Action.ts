import {
  City,
  CityBuild,
  PlayerAction,
  PlayerGovernment,
  PlayerResearch,
  PlayerTradeRates,
  Spaceship,
  Unit,
} from '../../types';
import { Element, s } from '@dom111/element';
import Transport from '../../Transport';
import tooltip from '../lib/Tooltip';

declare global {
  interface GlobalEventHandlersEventMap {
    actioned: CustomEvent<Action>;
  }
}

export interface IAction {
  activate(): void;
  build(): void;
  complete(): void;
  element(): HTMLElement;
  value():
    | City
    | CityBuild
    | PlayerResearch
    | Unit
    | PlayerGovernment
    | PlayerTradeRates
    | Spaceship;
}

export class Action extends Element implements IAction {
  #action: PlayerAction;
  #transport: Transport;

  constructor(action: PlayerAction, transport: Transport) {
    super(s('<div class="action"></div>'));

    this.#action = action;
    this.#transport = transport;

    this.on('keydown', (event) => {
      if (event.key === 'Escape') {
        return;
      }

      event.stopPropagation();
    });

    this.build();
  }

  activate(): void {}

  // The buttons an action adds, some once an icon has loaded, have the interface's tooltip rather than the browser's
  //  (#703): it shows on keyboard focus too. Their title names them for a screen reader, as their icon can't, and their
  //  key, if they have one, follows it.
  append(...nodes: (Node | Element)[]): void {
    super.append(...nodes);

    nodes.forEach((node) => {
      const element = node instanceof Element ? node.element() : node;

      if (!(element instanceof HTMLElement)) {
        return;
      }

      (element.matches('button[title]')
        ? [element]
        : Array.from(element.querySelectorAll<HTMLElement>('button[title]'))
      ).forEach((button) => {
        const name = button.title,
          key = button.getAttribute('aria-keyshortcuts'),
          title = key ? `${name} (${key})` : name;

        button.setAttribute('aria-label', name);
        tooltip(button, () => ({ title, rows: [] }));
      });
    });
  }

  build(): void {}

  complete(): void {
    this.emit(
      new CustomEvent('actioned', {
        bubbles: true,
        detail: this,
      })
    );
  }

  transport(): Transport {
    return this.#transport;
  }

  value():
    | City
    | CityBuild
    | PlayerResearch
    | Unit
    | PlayerGovernment
    | PlayerTradeRates
    | Spaceship {
    return this.#action.value;
  }
}

export default Action;
