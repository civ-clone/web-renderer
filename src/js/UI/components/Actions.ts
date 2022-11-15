import { Element, IElement } from './Element';
import { e, h } from '../lib/html';
import Action from './Actions/Action';
import AdjustTradeRates from './Actions/AdjustTradeRates';
import ChooseResearch from './Actions/ChooseResearch';
import CityBuild from './Actions/CityBuild';
import EndTurn from './Actions/EndTurn';
import { PlayerAction } from '../types';
import Portal from './Portal';
import Revolution from './Actions/Revolution';
import Transport from '../../Engine/Transport';

declare global {
  interface GlobalEventHandlersEventMap {
    actioned: CustomEvent<Action>;
  }
}

export interface IActions extends IElement {
  build(mandatoryActions: PlayerAction[], actions: PlayerAction[]): void;
}

export class Actions extends Element implements IActions {
  #portal: Portal;
  #transport: Transport;

  constructor(
    container: HTMLElement = e('div.actions'),
    portal: Portal,
    transport: Transport
  ) {
    super(container);

    this.#portal = portal;
    this.#transport = transport;

    this.element().addEventListener('actioned', (event) =>
      event.detail.element().remove()
    );

    this.element().addEventListener(
      'keydown',
      (event) => {
        const currentChild = document.activeElement;

        if (!this.element().contains(currentChild)) {
          return;
        }

        const { key } = event,
          children = Array.from(this.element().children) as HTMLElement[];

        if (
          !['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp'].includes(key) ||
          children.length === 0
        ) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        let currentAction =
          currentChild === this.element()
            ? ['ArrowLeft', 'ArrowUp'].includes(key)
              ? (currentChild.firstElementChild as HTMLElement)
              : (currentChild.lastElementChild as HTMLElement)
            : (currentChild as HTMLElement);

        while (currentAction.parentElement !== this.element()) {
          currentAction = currentAction.parentElement as HTMLElement;
        }

        const currentIndex = children.indexOf(currentAction);

        if (['ArrowUp', 'ArrowLeft'].includes(key)) {
          if (currentIndex > 0) {
            children[currentIndex - 1].querySelector('button')?.focus();

            return;
          }

          children.pop()!.querySelector('button')!.focus();

          return;
        }

        if (['ArrowDown', 'ArrowRight'].includes(key)) {
          if (currentIndex < children.length - 1) {
            children[currentIndex + 1]!.querySelector('button')!.focus();

            return;
          }

          children.shift()!.querySelector('button')!.focus();

          return;
        }
      },
      true
    );
  }

  build(actions: PlayerAction[]): void {
    this.empty();

    actions.forEach((playerAction) => {
      let action: Action;

      switch (playerAction._) {
        // This is handled separately so no need to worry.
        case 'ActiveUnit':
          return;

        case 'AdjustTradeRates':
          action = new AdjustTradeRates(playerAction, this.#transport);

          break;

        case 'ChooseResearch':
          action = new ChooseResearch(playerAction, this.#transport);

          break;

        case 'CityBuild':
          action = new CityBuild(playerAction, this.#portal, this.#transport);

          break;

        case 'EndTurn':
          action = new EndTurn(playerAction, this.#transport);

          break;

        case 'Revolution':
          action = new Revolution(playerAction, this.#transport);

          break;

        default:
          console.log('need to handle ' + playerAction._);
          return;
        // throw new TypeError(`Unknown action type '${action._}'.`);
      }

      this.element().prepend(
        h(action.element(), {
          click: () => action.activate(),
          keydown: ({ key }) => {
            if (key === ' ' || key === 'Enter') {
              action.activate();
            }
          },
        })
      );
    });
  }
}

export default Actions;
