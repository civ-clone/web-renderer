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
