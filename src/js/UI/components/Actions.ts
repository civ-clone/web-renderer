import { Element, s } from '@dom111/element';
import Action from './Actions/Action';
import AdjustTradeRates from './Actions/AdjustTradeRates';
import ChooseGovernment from './Actions/ChooseGovernment';
import ChooseResearch from './Actions/ChooseResearch';
import CityBuild from './Actions/CityBuild';
import CivilDisorder from './Actions/CivilDisorder';
import EndTurn from './Actions/EndTurn';
import Notice from './Actions/Notice';
import { Player, PlayerAction } from '../types';
import Portal from './Portal';
import Revolution from './Actions/Revolution';
import Spaceship from './Actions/Spaceship';
import Transport from '../Transport';
import { getClosestAncestorMatching } from '../lib/html';
import { hideTooltipWithin } from './lib/Tooltip';
import { mappedKeyFromEvent } from '../lib/mappedKey';

declare global {
  interface GlobalEventHandlersEventMap {
    actioned: CustomEvent<Action>;
  }
}

export interface IActions {
  build(actions: PlayerAction[], player?: Player): void;
}

/**
 * The `Action` for one of the player's actions, which draws its orb and does what pressing it does: shared by the orbs
 *  and the Next Turn button (#702). Null for those handled elsewhere (the unit, the city screen) and any not known.
 */
export const createAction = (
  playerAction: PlayerAction,
  portal: Portal,
  transport: Transport,
  player?: Player
): Action | null => {
  switch (playerAction._) {
    case 'AdjustTradeRates':
      return new AdjustTradeRates(playerAction, transport);

    case 'ChooseGovernment':
      return new ChooseGovernment(playerAction, transport);

    case 'ChooseResearch':
      return new ChooseResearch(playerAction, transport, player);

    case 'CityBuild':
      return new CityBuild(playerAction, portal, transport);

    case 'CivilDisorder':
      return new CivilDisorder(playerAction, portal, transport);

    case 'EndTurn':
      return new EndTurn(playerAction, transport);

    case 'Notice':
      return new Notice(playerAction, portal, transport);

    case 'LaunchSpaceship':
      return new Spaceship(playerAction, transport);

    case 'Revolution':
      return new Revolution(playerAction, transport);

    case 'ActiveUnit':
    case 'ChangeProduction':
    case 'ChangeSpecialist':
    case 'ChangeWorkedTile':
    case 'CompleteProduction':
    case 'InactiveUnit':
    case 'SellImprovement':
      return null;

    default:
      console.log('need to handle ' + playerAction._);

      return null;
  }
};

export class Actions extends Element implements IActions {
  #actions = new Map<Node, Action>();
  #portal: Portal;
  #transport: Transport;

  #actionedHandler = (event: CustomEvent<Action>) => event.detail.remove();
  #clickHandler = (event: MouseEvent) => {
    // The page's `Element`, not `@dom111/element`'s, which this file imports as `Element` too: no click is one of those,
    //  so the orbs answered no click or tap at all. Any element, as the target can be a glyph's `<svg>` (#741).
    const target = getClosestAncestorMatching(
      event.target instanceof globalThis.Element ? event.target : null,
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

  build(actions: PlayerAction[], player?: Player): void {
    this.unbindEvents();

    // An action's tooltip goes with it (#703).
    hideTooltipWithin(this.element());

    this.empty();

    // `empty()` only detaches the DOM nodes; without clearing, this registry
    // retains every `Action` (and its `PlayerAction` slice of the data graph)
    // ever built, growing on each rebuild for the lifetime of the page.
    this.#actions.clear();

    actions.forEach((playerAction) => {
      const action = createAction(
        playerAction,
        this.#portal,
        this.#transport,
        player
      );

      if (action === null) {
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
