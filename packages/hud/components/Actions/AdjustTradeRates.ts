import Action from './Action';
import LockedSlider from '@civ-clone/ui-widgets/components/LockedSlider';
import LockedSliderGroup from '@civ-clone/ui-widgets/components/LockedSliderGroup';
import { Player, PlayerTradeRates } from '@civ-clone/ui-protocol/types';
import Transport from '@civ-clone/ui-client/Transport';
import Window from '@civ-clone/ui-component-window/Window';
import { assetStore } from '@civ-clone/ui-assets/AssetStore';
import { s } from '@dom111/element';
import { TOptions, t } from 'i18next';
import { button } from '@civ-clone/ui-component-button/button';
import {
  empireTotals,
  rateClasses,
  rateIcons,
  ratePosition,
} from '../../lib/empire';
import { h } from '@civ-clone/ui-widgets/lib/html';
import { yieldIcon } from '@civ-clone/ui-city/components/lib/cityYields';
import { interfaceSpriteKey } from '@civ-clone/ui-assets/lib/interfaceArt';

// The key the button's tooltip shows. `-` opens the window too (#662).
export const tradeRatesKey = '+';

// How long the rates wait after the last move before they're sent, so dragging a slider doesn't ask every city for its
//  yields at every step.
export const tradeRatesDelay = 150;

let open: Window | null = null,
  // Brings the open window up to date with the rates and the empire as they now are (`refreshTradeRates`).
  refreshOpen:
    | ((tradeRates: PlayerTradeRates, player: Player | null) => void)
    | null = null,
  // The player as the top bar last drew them, for the window's figures when it opens from a key or a button.
  latestPlayer: Player | null = null;

// Text, not markup: i18next's HTML escaping would show `&` as `&amp;` (#704).
const text = (key: string, options: TOptions = {}): string =>
  t(key, { ...options, interpolation: { escapeValue: false } });

/**
 * Brings an open Adjust trade rates window up to date with the player's rates and cities as the engine now sends them:
 *  the gold, research and disorder its rates give (#1058), and a change of government's maximums and what
 *  Fundamentalism limits (M2d), which the window, open across it, would otherwise hold the old ones of. The top bar
 *  calls it each time it's drawn, so the player is kept for the next window too.
 */
export const refreshTradeRates = (
  tradeRates: PlayerTradeRates,
  player: Player | null = null
): void => {
  if (player !== null) {
    latestPlayer = player;
  }

  if (open !== null && open.element().isConnected) {
    refreshOpen?.(tradeRates, player ?? latestPlayer);
  }
};

declare global {
  interface DocumentEventMap {
    traderatesclosed: CustomEvent<void>;
  }
}

/**
 * Whether an Adjust trade rates window is open: the turn isn't ended for the player while it is, as its rates are being
 *  tried out live, and moving them can clear the civil disorder that was all that held the turn back (#1058). Its close
 *  says `traderatesclosed` on the document, for the turn to be looked at again.
 */
export const tradeRatesOpen = (): boolean =>
  open !== null && open.element().isConnected;

// Rates sent that the game hasn't answered yet: until it has, the cities' figures are from before them.
let unanswered = 0,
  // The rates last sent, by any window: one opened before they're answered starts from them, not from the rates the
  //  engine had before, which closing it would send back over them.
  inFlight: [string, number][] | null = null;

/**
 * Whether the trade rates are still being settled: the window is open, or rates it sent haven't been answered, so the
 *  figures on hand may be from before them. The turn isn't ended for the player until they are (#1058).
 */
export const tradeRatesSettling = (): boolean =>
  tradeRatesOpen() || unanswered > 0;

/** The game has answered an `AdjustTradeRates`: whether that was the last one outstanding. */
export const tradeRatesAnswered = (): boolean => {
  unanswered = Math.max(0, unanswered - 1);

  return unanswered === 0;
};

// Whether the game is waiting for the other civilizations, when it takes no actions: the window shows the rates, but
//  can't change them until the turn comes back (#1058).
let waitingForTurn = false,
  showWaiting: (() => void) | null = null;

/** Said by the game as the turn ends and starts again, for an open window to stop or start taking changes. */
export const setTradeRatesWaiting = (
  waiting: boolean,
  // A wait that isn't the turn changing hands (the game being carried over): rates sent before it are still answered.
  turnChanging: boolean = true
): void => {
  waitingForTurn = waiting;

  // Rates sent before the turn changed hands are answered, or will never be: none is outstanding into the next.
  if (turnChanging) {
    unanswered = 0;
    inFlight = null;
  }

  showWaiting?.();
};

/** The game is going: an open window closes without sending, and nothing it held carries over (#1058). */
export const disposeTradeRates = (): void => {
  disposeOpen?.();
  open?.element().remove();
  open = null;
  refreshOpen = null;
  showWaiting = null;
  latestPlayer = null;
  waitingForTurn = false;
  unanswered = 0;
  inFlight = null;
};

// A window taken off the page without being closed (a game torn down, say): its End Turn listener and pending send go
//  with it.
let disposeOpen: (() => void) | null = null;

const rateName = (rate: string): string =>
  text(`${rate}.name`, { defaultValue: rate, ns: 'trade' });

/**
 * Opens the Adjust trade rates window for the player's `tradeRates`, for the button, the top bar and the `+` and `-`
 *  keys alike (#662). The rates are applied as they're moved, after a moment's pause, so the window shows what they
 *  give as the engine counts it (#274, #1058): the gold and research a turn, the turns to the next advance, and the
 *  cities in disorder. OK keeps them; Cancel, Escape and the close button put back the rates it opened with.
 *
 * The window isn't modal, so one already open is brought forward rather than a second one opened.
 */
export const openTradeRates = (
  tradeRates: PlayerTradeRates,
  transport: Transport,
  player: Player | null = latestPlayer
): Window => {
  if (open !== null && !open.element().isConnected) {
    disposeOpen?.();
  }

  if (open !== null && open.element().isConnected) {
    refreshOpen?.(tradeRates, player ?? latestPlayer);
    open.element().focus();

    return open;
  }

  const sliders: LockedSlider[] = [],
    // A rate worth less than it's set to, under this government (Civ2's Fundamentalism and research).
    limitNotes = (rates: PlayerTradeRates): HTMLElement[] =>
      Object.entries(rates.limitedRates ?? {}).map(([rate, limit]) => {
        const note = s('<p class="adjust-trade-rates-limit"></p>');

        note.textContent = text('Actions.AdjustTradeRates.limited', {
          rate: rateName(rate),
          limit,
        });

        return note;
      }),
    notes = s(
      '<div class="adjust-trade-rates-limits"></div>',
      ...limitNotes(tradeRates)
    ),
    ordered = [...tradeRates.all].sort(
      (a, b) => ratePosition(a._) - ratePosition(b._)
    ),
    // The split at a glance, coloured as the top bar's is.
    bar = s('<div class="adjust-trade-rates-bar" aria-hidden="true"></div>'),
    segments = ordered.map((rate) => {
      const segment = s('<span class="segment"></span>');

      segment.classList.add(rateClasses[rate._] ?? 'other');
      bar.append(segment);

      return segment;
    }),
    // What the rates give, read again from the cities each time the engine sends them.
    effect = s(
      '<dl class="adjust-trade-rates-effect" aria-live="polite"></dl>'
    ),
    // The rates the window opened with, which Cancel puts back, and the empire as it was then, to compare against.
    // The rates the engine holds, as the player last saw them.
    held = tradeRates.all.map((rate): [string, number] => [rate._, rate.value]),
    opening = unanswered > 0 && inFlight !== null ? inFlight : held,
    openingValue = (rate: string): number =>
      opening.find(([key]) => key === rate)?.[1] ?? 0,
    before = player === null ? null : empireTotals(player);

  // The rates as they were last sent, for the caps.
  let current = tradeRates,
    // What was last sent, and what the engine last said it holds: a send is skipped only when the rates match both, so
    //  neither a send that never arrived nor a refresh that arrives before a later send's answer can leave the engine on
    //  rates the window doesn't show. A send now and then that wasn't needed does no harm.
    sent = opening,
    engine = held,
    pending: ReturnType<typeof setTimeout> | null = null,
    kept = false,
    // A refresh moving the sliders to new maximums: the rebalance isn't the player's to send.
    refreshing = false;

  const values = (): [string, number][] =>
      sliders.map((slider): [string, number] => [slider.key(), slider.value()]),
    same = (a: [string, number][], b: [string, number][]): boolean =>
      a.length === b.length &&
      a.every(([key, value]) =>
        b.some(([otherKey, other]) => otherKey === key && other === value)
      ),
    // Whether it sent anything.
    send = (value: [string, number][]): boolean => {
      // The game takes no actions while waiting, or keeps none (a game being carried over): nothing is sent.
      if (waitingForTurn || (same(value, sent) && same(value, engine))) {
        return false;
      }

      sent = value;
      unanswered++;
      inFlight = value;

      transport.send('action', {
        name: 'AdjustTradeRates',
        id: tradeRates.id,
        value,
      });

      return true;
    },
    // Rates held by their maximums that can't come to 100 can't be set: they're left as they were.
    sendable = (): boolean =>
      Object.keys(current.maxRates ?? {}).length === 0 ||
      sliderGroup.balanced(),
    // Whether it sent anything.
    flush = (): boolean => {
      if (pending !== null) {
        clearTimeout(pending);
        pending = null;
      }

      return sendable() && send(values());
    },
    schedule = (): void => {
      if (pending !== null) {
        clearTimeout(pending);
      }

      pending = setTimeout(flush, tradeRatesDelay);
    },
    showSplit = (): void =>
      ordered.forEach((rate, index) => {
        const slider = sliders.find((slider) => slider.key() === rate._);

        segments[index]!.style.flexGrow = `${slider?.value() ?? 0}`;
      }),
    // One term and its figure for each of gold, research and disorder: made once, the first time there's a player to
    //  count, and after that only their text changes, and only when it differs, so a screen reader hears a figure
    //  when it changes rather than the list again at every patch.
    terms: { [name: string]: HTMLElement } = {},
    term = (name: string, icon: string, title: string): void => {
      const dt = s(`<dt class="${name}"></dt>`),
        dd = s(
          `<dd class="${name}"><span class="value"></span> <span class="detail"></span></dd>`
        );

      dt.append(yieldIcon(icon), title);
      effect.append(dt, dd);
      terms[name] = dd;
    },
    show = (name: string, value: string, detail: string): void => {
      const dd = terms[name]!,
        valueElement = dd.querySelector('.value')!,
        detailElement = dd.querySelector('.detail')!;

      if (valueElement.textContent !== value) {
        valueElement.textContent = value;
      }

      if (detailElement.textContent !== detail) {
        detailElement.textContent = detail;
      }
    },
    was = (now: number, then: number | undefined): string =>
      then === undefined || then === now
        ? ''
        : text('Actions.AdjustTradeRates.Effect.was', { value: then }),
    showEffect = (player: Player | null): void => {
      if (player === null) {
        return;
      }

      if (Object.keys(terms).length === 0) {
        term('gold', 'Gold', text('Actions.AdjustTradeRates.Effect.gold'));
        term(
          'research',
          'Research',
          text('Actions.AdjustTradeRates.Effect.research')
        );
        term(
          'disorder',
          'Unhappiness',
          text('Actions.AdjustTradeRates.Effect.disorder')
        );
      }

      const totals = empireTotals(player);

      show(
        'gold',
        text('Actions.AdjustTradeRates.Effect.per-turn', {
          perTurn: totals.gold,
        }),
        was(totals.gold, before?.gold)
      );
      show(
        'research',
        text('Actions.AdjustTradeRates.Effect.per-turn', {
          perTurn: totals.research,
        }),
        [
          text('PlayerDetails.Researching.detail', {
            turns: totals.researchTurns,
            context: totals.researchContext,
          }),
          was(totals.research, before?.research),
        ]
          .filter((part) => part !== '')
          .join(' ')
      );
      show(
        'disorder',
        text('Actions.AdjustTradeRates.Effect.cities', {
          count: totals.disorder,
        }),
        was(totals.disorder, before?.disorder)
      );
      terms.disorder!.classList.toggle('negative', totals.disorder > 0);
    };

  const window = new Window(
    t('Actions.AdjustTradeRates.title'),
    s(
      '<div class="content"></div>',
      bar,
      s(
        '<div class="adjust-trade-rates-rates"></div>',
        ...ordered.map((tradeRate) => {
          // Each stops at its maximum, where the rules have one (Civ2's, M2d).
          const slider = new LockedSlider(
            tradeRate._,
            openingValue(tradeRate._),
            rateName(tradeRate._),
            tradeRates.maxRates?.[tradeRate._] ?? 100,
            yieldIcon(rateIcons[tradeRate._] ?? tradeRate._)
          );

          slider.addClass(rateClasses[tradeRate._] ?? 'other');
          sliders.push(slider);

          return slider;
        })
      ),
      notes,
      effect,
      s(
        '<footer></footer>',
        h(button(t('Generic.ok'), { variant: 'primary' }), {
          click: () => {
            kept = true;
            window.close();
          },
        }),
        h(
          button(t('Generic.cancel'), {
            variant: 'quiet',
            hotkey: 'Escape',
          }),
          {
            click: () => window.close(),
          }
        )
      )
    ),
    {
      classes: 'adjust-trade-rates',
    }
  );

  const sliderGroup = new LockedSliderGroup(...sliders);

  // Every move, the player's or a rebalance's, redraws the split; the player's are sent once they pause.
  sliders.forEach((slider) =>
    slider.onInput(() => {
      showSplit();

      if (!refreshing) {
        schedule();
      }
    })
  );

  showSplit();
  showEffect(player);

  refreshOpen = (rates: PlayerTradeRates, player: Player | null): void => {
    current = rates;
    engine = rates.all.map((rate): [string, number] => [rate._, rate.value]);
    refreshing = true;
    sliders.forEach((slider) =>
      slider.setMax(rates.maxRates?.[slider.key()] ?? 100)
    );
    refreshing = false;
    notes.replaceChildren(...limitNotes(rates));
    showEffect(player);
  };

  // The turn is ending with the window open: the rates on screen are the turn's, so they're kept, and what's pending is
  //  sent now, ahead of End Turn, which would otherwise leave it, or a later Cancel, to arrive after the turn had gone.
  const settle = (): void => {
    kept = true;
    window.close();
  };

  document.addEventListener('beforeendturn', settle);

  // Waiting for the turn, the rates and OK are out of reach, and the window says why; Cancel and closing still work.
  const rateRows = window
      .element()
      .querySelector('.adjust-trade-rates-rates') as HTMLElement,
    okButton = window
      .element()
      .querySelector('.btn-primary') as HTMLButtonElement | null,
    cancelButton = window
      .element()
      .querySelector('.btn-quiet') as HTMLButtonElement | null,
    waitingNote = s(
      '<p class="adjust-trade-rates-waiting" role="status" hidden></p>'
    );

  waitingNote.textContent = text('Game.waiting');
  rateRows.after(waitingNote);

  showWaiting = (): void => {
    // Focus in the rows would fall to the page as they go inert, out of the window's reach for Escape.
    if (
      waitingForTurn &&
      (rateRows.contains(document.activeElement) ||
        document.activeElement === okButton)
    ) {
      cancelButton?.focus();
    }

    // A move not yet sent won't be taken now.
    if (waitingForTurn && pending !== null) {
      clearTimeout(pending);
      pending = null;
    }

    rateRows.inert = waitingForTurn;
    waitingNote.hidden = !waitingForTurn;

    if (okButton !== null) {
      okButton.disabled = waitingForTurn;
    }
  };

  showWaiting();

  disposeOpen = (): void => {
    document.removeEventListener('beforeendturn', settle);

    if (pending !== null) {
      clearTimeout(pending);
      pending = null;
    }

    if (open === window) {
      open = null;
      refreshOpen = null;
      disposeOpen = null;
      showWaiting = null;
    }
  };

  window.on('close', () => {
    document.removeEventListener('beforeendturn', settle);

    if (open === window) {
      disposeOpen = null;
      showWaiting = null;
    }

    if (open === window) {
      open = null;
      refreshOpen = null;
    }

    if (kept) {
      flush();
    } else {
      if (pending !== null) {
        clearTimeout(pending);
        pending = null;
      }

      // Put back the rates it opened with, unless a new government's maximums leave them out of reach.
      if (
        opening.every(
          ([rate, value]) => value <= (current.maxRates?.[rate] ?? 100)
        )
      ) {
        send(opening);
      }
    }

    // The turn may be ended for the player again: at once if nothing is outstanding, or once the game has answered the
    //  last of the rates sent, when the cities are as they now are (`tradeRatesSettling`).
    queueMicrotask(() =>
      document.dispatchEvent(new CustomEvent('traderatesclosed'))
    );
  });

  open = window;

  return window;
};

export class AdjustTradeRates extends Action {
  override activate(): void {
    openTradeRates(this.value(), this.transport());
  }

  override build(): void {
    // `Plus` is `tradeRatesKey` as `aria-keyshortcuts` writes it, where `+` joins keys.
    assetStore
      .spriteURL(interfaceSpriteKey('city/trade'))
      .then((url) =>
        this.append(
          s(
            `<button class="btn-bare adjustTradeRates small" aria-keyshortcuts="Plus" title="${t(
              'Actions.AdjustTradeRates.title'
            )}"><img src="${url}"></button>`
          )
        )
      );
  }

  override value(): PlayerTradeRates {
    return super.value() as PlayerTradeRates;
  }
}

export default AdjustTradeRates;
