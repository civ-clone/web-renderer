import { Element, s } from '@dom111/element';
import Action from './Actions/Action';
import AdjustTradeRates from './Actions/AdjustTradeRates';
import ChooseResearch from './Actions/ChooseResearch';
import CityBuild from './Actions/CityBuild';
import CivilDisorder from './Actions/CivilDisorder';
import EndTurn from './Actions/EndTurn';
import { PlayerAction } from '../types';
import Portal from './Portal';
import Revolution from './Actions/Revolution';
import Spaceship from './Actions/Spaceship';
import Transport from '../Transport';
import { getClosestAncestorMatching, h } from '../lib/html';
import { mappedKeyFromEvent } from '../lib/mappedKey';

declare global {
  interface GlobalEventHandlersEventMap {
    actioned: CustomEvent<Action>;
  }
}

export interface IActions {
  build(mandatoryActions: PlayerAction[], actions: PlayerAction[]): void;
}

export class Actions extends Element implements IActions {
  #actions = new Map<Node, Action>();
  #portal: Portal;
  #transport: Transport;

  #actionedHandler = (event: CustomEvent<Action>) => event.detail.remove();
  #clickHandler = (event: MouseEvent) => {
    const target = getClosestAncestorMatching(
      event.target instanceof HTMLElement ? event.target : null,
      '.action'
    );

    if (!target) {
      return;
    }

    const actionElement = this.#actions.get(target) ?? null;

    if (!actionElement) {
      return;
    }

    actionElement.activate();
  };
  #keyDownHandler = (event: KeyboardEvent) => {
    const currentChild = document.activeElement;

    if (!this.element().contains(currentChild)) {
      return;
    }

    const key = mappedKeyFromEvent(event),
      children = Array.from(this.element().children) as HTMLElement[];

    if (
      ![
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        ' ',
        'Enter',
      ].includes(key) ||
      children.length === 0
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if ([' ', 'Enter'].includes(key)) {
      const actionElement = currentChild
          ? getClosestAncestorMatching(currentChild ?? null, '.action')
          : null,
        action = actionElement && this.#actions.get(actionElement);

      action?.activate();

      return;
    }

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
  };

  constructor(
    container: HTMLElement = s('<div class="actions"></div>'),
    portal: Portal,
    transport: Transport
  ) {
    super(container);

    this.#portal = portal;
    this.#transport = transport;

    this.bindEvents();
  }

  protected bindEvents(): void {
    this.on('actioned', this.#actionedHandler);

    this.on('keydown', this.#keyDownHandler, true);

    this.on('click', this.#clickHandler);
  }

  build(actions: PlayerAction[]): void {
    this.unbindEvents();

    this.empty();

    actions.forEach((playerAction) => {
      let action: Action;

      switch (playerAction._) {
        case 'AdjustTradeRates':
          action = new AdjustTradeRates(playerAction, this.#transport);

          break;

        case 'ChooseResearch':
          action = new ChooseResearch(playerAction, this.#transport);

          break;

        case 'CityBuild':
          action = new CityBuild(playerAction, this.#portal, this.#transport);

          break;

        case 'CivilDisorder':
          action = new CivilDisorder(
            playerAction,
            this.#portal,
            this.#transport
          );

          break;

        case 'EndTurn':
          action = new EndTurn(playerAction, this.#transport);

          break;

        case 'LaunchSpaceship':
          action = new Spaceship(playerAction, this.#transport);

          break;

        case 'Revolution':
          action = new Revolution(playerAction, this.#transport);

          break;

        case 'ActiveUnit':
        case 'ChangeProduction':
        case 'CompleteProduction':
        case 'InactiveUnit':
          return;

        default:
          console.log('need to handle ' + playerAction._);

          return;
      }

      this.append(action);
      this.#actions.set(action.element(), action);
    });

    this.bindEvents();
  }

  protected unbindEvents(): void {
    this.off('actioned', this.#actionedHandler);

    this.off('keydown', this.#keyDownHandler, true);

    this.off('click', this.#clickHandler);
  }
}

export default Actions;
