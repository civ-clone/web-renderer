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
  refreshOpen: ((tradeRates: PlayerTradeRates, player: Player) => void) | null =
    null,
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
    refreshOpen?.(tradeRates, player ?? latestPlayer!);
  }
};

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
  if (open !== null && open.element().isConnected) {
    refreshOpen?.(tradeRates, player ?? latestPlayer!);
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
    opening = tradeRates.all.map((rate): [string, number] => [
      rate._,
      rate.value,
    ]),
    before = player === null ? null : empireTotals(player);

  // The rates as they were last sent, for the caps.
  let current = tradeRates,
    // What was last sent, to send nothing that's already there.
    sent = opening,
    pending: ReturnType<typeof setTimeout> | null = null,
    kept = false;

  const values = (): [string, number][] =>
      sliders.map((slider): [string, number] => [slider.key(), slider.value()]),
    same = (a: [string, number][], b: [string, number][]): boolean =>
      a.length === b.length &&
      a.every(([key, value]) =>
        b.some(([otherKey, other]) => otherKey === key && other === value)
      ),
    send = (value: [string, number][]): void => {
      if (same(value, sent)) {
        return;
      }

      sent = value;

      transport.send('action', {
        name: 'AdjustTradeRates',
        id: tradeRates.id,
        value,
      });
    },
    // Rates held by their maximums that can't come to 100 can't be set: they're left as they were.
    sendable = (): boolean =>
      Object.keys(current.maxRates ?? {}).length === 0 ||
      sliderGroup.balanced(),
    flush = (): void => {
      if (pending !== null) {
        clearTimeout(pending);
        pending = null;
      }

      if (sendable()) {
        send(values());
      }
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
    term = (
      className: string,
      icon: string,
      title: string,
      value: string,
      detail: string = ''
    ): HTMLElement[] => {
      const dt = s(`<dt class="${className}"></dt>`),
        dd = s(
          `<dd class="${className}"><span class="value"></span> <span class="detail"></span></dd>`
        );

      dt.append(yieldIcon(icon), title);
      dd.querySelector('.value')!.textContent = value;
      dd.querySelector('.detail')!.textContent = detail;

      return [dt, dd];
    },
    was = (now: number, then: number | undefined): string =>
      then === undefined || then === now
        ? ''
        : text('Actions.AdjustTradeRates.Effect.was', { value: then }),
    showEffect = (player: Player | null): void => {
      if (player === null) {
        effect.replaceChildren();

        return;
      }

      const totals = empireTotals(player);

      effect.replaceChildren(
        ...term(
          'gold',
          'Gold',
          text('Actions.AdjustTradeRates.Effect.gold'),
          text('Actions.AdjustTradeRates.Effect.per-turn', {
            perTurn: totals.gold,
          }),
          was(totals.gold, before?.gold)
        ),
        ...term(
          'research',
          'Research',
          text('Actions.AdjustTradeRates.Effect.research'),
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
        ),
        ...term(
          `disorder${totals.disorder > 0 ? ' negative' : ''}`,
          'Unhappiness',
          text('Actions.AdjustTradeRates.Effect.disorder'),
          text('Actions.AdjustTradeRates.Effect.cities', {
            count: totals.disorder,
          }),
          was(totals.disorder, before?.disorder)
        )
      );
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
            tradeRate.value,
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
      schedule();
    })
  );

  showSplit();
  showEffect(player);

  refreshOpen = (rates: PlayerTradeRates, player: Player | null): void => {
    current = rates;
    sliders.forEach((slider) =>
      slider.setMax(rates.maxRates?.[slider.key()] ?? 100)
    );
    notes.replaceChildren(...limitNotes(rates));
    showEffect(player);
  };

  window.on('close', () => {
    if (open === window) {
      open = null;
      refreshOpen = null;
    }

    if (kept) {
      flush();

      return;
    }

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
