import { City, Player } from '@civ-clone/ui-protocol/types';
import { Element, s } from '@dom111/element';
import { NextTurnItem } from '@civ-clone/ui-client/lib/nextTurnQueue';
import Action from './Actions/Action';
import Notice from './Actions/Notice';
import Portal from '@civ-clone/ui-map/components/Portal';
import Transport from '@civ-clone/ui-client/Transport';
import { TransportTranslatedNotice } from '@civ-clone/ui-protocol/Transport';
import button from '@civ-clone/ui-component-button/button';
import { createAction } from './Actions';
import endTurn from '@civ-clone/ui-client/lib/endTurn';
import { glyph } from '@civ-clone/ui-assets/lib/glyphs';
import { setNoticeCategory } from './lib/noticeCategory';
import { t } from 'i18next';
import tooltip from '@civ-clone/ui-component-tooltip/Tooltip';

// The Next Turn button (#702), in place of the orbs under the new interface (#735): one button that names what needs
//  the player next and does it when pressed, the item's place in the queue under it, and End turn once nothing is
//  left. Enter presses it and Shift+Enter skips to the next item (`InputController`). Each item runs the same `Action`
//  its orb would, so the windows it opens are the ones the orbs open.

// The worker's notices for whose turn it is, and what the button says for each while waiting.
const waitingKeys: Record<string, string> = {
  'Game.progress.player': 'NextTurn.waiting.player',
  'Game.progress.unmet-player': 'NextTurn.waiting.unmet-player',
};

export type NextTurnDeps = {
  portal: Portal;
  transport: Transport;
  // The units awaiting orders: the map centred on the active one.
  centreActiveUnit: () => void;
};

export class NextTurn extends Element {
  #actions = new Map<string, Action>();
  #deps: NextTurnDeps;
  // Where the button is in the queue: kept across rebuilds, so a skipped item stays skipped until the queue wraps.
  #index = 0;
  #items: NextTurnItem[] = [];
  #player: Player | null = null;
  // Standing notices opened this turn, which leave the queue until the next: civil disorder stays until it's put
  //  right, and doesn't hold up the turn (a notice of its own dismisses itself when opened).
  #seen = new Set<string>();
  // End turn pressed: nothing more until the next turn's queue (#11).
  #sent = false;
  // The turn the queue is for: a new one starts it afresh, even if no waiting build came between (#702).
  #turn: number | null = null;
  #waiting = false;
  // Whose turn it is while waiting, from the line along the top of the page (#588): "Waiting for the Germans…" (#702).
  #waitingFor: TransportTranslatedNotice | null = null;

  constructor(element: HTMLElement, deps: NextTurnDeps) {
    super(element);

    this.#deps = deps;
  }

  build(
    queue: NextTurnItem[],
    waiting: boolean,
    player: Player,
    turn: number | null = null
  ): void {
    if (waiting || turn !== this.#turn) {
      this.#seen.clear();
    }

    if (turn !== this.#turn) {
      this.#index = 0;
      this.#items = [];
      this.#sent = false;
      this.#turn = turn;
    }

    const items = queue.filter((item) => !this.#seen.has(item.id)),
      current = this.#items[this.#index]?.id ?? null,
      kept = items.findIndex((item) => item.id === current);

    // The item it was on if it's still there, otherwise whatever has taken its place.
    this.#index =
      kept !== -1 ? kept : Math.max(0, Math.min(this.#index, items.length - 1));
    this.#items = items;
    this.#player = player;
    this.#waiting = waiting;

    // Until the next turn: End turn is still offered until the engine has the message.
    if (waiting || !items.some((item) => this.#isEndTurn(item))) {
      this.#sent = false;
    }

    // Only the actions still waiting keep their `Action`, so a picker that's opening isn't opened twice (#484). By the
    //  action's own id, as the orbs are: one sent again is a new action, with what it holds now.
    Array.from(this.#actions.keys())
      .filter(
        (id) =>
          !items.some((item) => item.kind === 'action' && item.action.id === id)
      )
      .forEach((id) => this.#actions.delete(id));

    this.#draw();
  }

  /** Does what the button says: the item's own action, or End turn. */
  press(): void {
    const item = this.#items[this.#index];

    if (this.#waiting || this.#sent || !item) {
      return;
    }

    if (item.kind === 'units') {
      this.#deps.centreActiveUnit();

      return;
    }

    if (this.#isEndTurn(item)) {
      this.#sent = true;
      this.#draw();

      endTurn(this.#deps.transport);

      return;
    }

    this.#action(item)?.activate();

    // Seen, and gone from the queue for the turn: opening a notice's window dismisses it, and civil disorder stays an
    //  action until it's put right, and doesn't hold up the turn. Now, as nothing the engine sends may follow.
    if (['CivilDisorder', 'Notice'].includes(item.action._)) {
      this.#drop(item.id);
    }
  }

  // Out of the queue for the rest of the turn, and the button on to what took its place.
  #drop(id: string): void {
    const index = this.#items.findIndex((item) => item.id === id);

    this.#seen.add(id);

    if (index === -1) {
      return;
    }

    this.#items = this.#items.filter((item) => item.id !== id);

    if (index < this.#index) {
      this.#index--;
    }

    this.#index = Math.min(this.#index, Math.max(0, this.#items.length - 1));
    this.#draw();
  }

  /** Who the game is waiting for: the worker's `Game.progress.player` or `Game.progress.unmet-player` notice, which
   *  names only a civilization the player has met (#59). Anything else, or null, says the other civilizations. */
  waitingFor(notice: TransportTranslatedNotice | null): void {
    this.#waitingFor =
      notice !== null && notice.key in waitingKeys ? notice : null;

    if (this.#waiting) {
      this.#draw();
    }
  }

  /** On to the next item, back to the first after the last. End turn is one of them when it's offered, which is when
   *  only the notices, which don't hold up the turn, are left. */
  skip(): void {
    if (this.#waiting || this.#items.length < 2) {
      return;
    }

    this.#index = (this.#index + 1) % this.#items.length;
    this.#draw();
  }

  // The items other than End turn, which is offered only when nothing the engine must have is left.
  #count(): number {
    return this.#items.filter((item) => !this.#isEndTurn(item)).length;
  }

  #isEndTurn(item: NextTurnItem | undefined): boolean {
    return item?.kind === 'action' && item.action._ === 'EndTurn';
  }

  #action(item: NextTurnItem): Action | null {
    if (item.kind !== 'action') {
      return null;
    }

    const id = item.action.id;

    if (!this.#actions.has(id)) {
      const action = createAction(
        item.action,
        this.#deps.portal,
        this.#deps.transport,
        this.#player ?? undefined
      );

      if (action === null) {
        return null;
      }

      // Answered (a build or an advance chosen): gone at once, as its orb would be, rather than there to open again
      //  until the engine's next update arrives.
      action.element().addEventListener('actioned', () => this.#drop(item.id));

      this.#actions.set(id, action);
    }

    return this.#actions.get(id)!;
  }

  #label(item: NextTurnItem | undefined): string {
    if (this.#waiting && this.#waitingFor !== null) {
      return String(
        t(waitingKeys[this.#waitingFor.key], {
          ...this.#waitingFor.data,
          skipOnVariables: false,
        })
      );
    }

    if (this.#waiting || !item) {
      return t('Game.waiting');
    }

    if (item.kind === 'units') {
      return t('NextTurn.units', { count: item.count });
    }

    const { action } = item;

    switch (action._) {
      case 'CityBuild':
        return t('NextTurn.CityBuild', {
          city: (action.value as unknown as { city: City }).city,
        });

      case 'CivilDisorder':
        return t('Actions.CivilDisorder.title', { city: action.value });

      case 'Notice':
        return (this.#action(item) as Notice).text('title');

      default:
        return t(`Actions.${action._}.title`);
    }
  }

  #draw(): void {
    const item = this.#items[this.#index],
      ready = this.#isEndTurn(item),
      label = this.#label(item),
      count = this.#count(),
      next = button('', {
        variant: ready ? 'primary' : 'secondary',
        hotkey: this.#waiting ? null : 'Enter',
        className: 'ui-next-turn',
        disabled: this.#waiting || this.#sent || !item,
      }),
      text = s('<span class="ui-next-turn-label"></span>');

    text.textContent = label;
    next.append(text);

    if (ready) {
      next.insertAdjacentHTML('afterbegin', glyph('end-turn'));
    } else if (item && !this.#waiting) {
      // A small orb in the tint the item's own orb has, so each kind has its colour (#702).
      next.dataset.kind = item.kind === 'units' ? 'units' : item.action._;

      if (item.kind === 'action') {
        setNoticeCategory(next, item.action);
      }
      next.prepend(
        s('<span class="ui-next-turn-swatch" aria-hidden="true"></span>')
      );
    }

    if (!ready && !this.#waiting && count > 0) {
      const place = s('<span class="ui-next-turn-place"></span>');

      place.textContent = t('NextTurn.place', {
        place: this.#index + 1,
        count,
      });
      next.append(place);
    }

    next.addEventListener('click', () => this.press());

    const focused = this.element().contains(document.activeElement);

    // In the page before its tooltip is given, so an open one moves to it from the button it replaces.
    this.element().replaceChildren(
      s('<div class="ui-next-turn-holder"></div>', next)
    );

    tooltip(
      next,
      () => ({
        title: label,
        rows: this.#waiting
          ? []
          : [
              ['Enter', t('NextTurn.Keys.press')],
              ...(this.#items.length > 1
                ? ([['Shift+Enter', t('NextTurn.Keys.skip')]] as [
                    string,
                    string
                  ][])
                : []),
            ],
      }),
      { key: 'next-turn' }
    );

    // Focus stays on the button through a redraw, for Space as well as Enter.
    if (focused && document.activeElement !== next && !next.disabled) {
      next.focus();
    }
  }
}

export default NextTurn;
