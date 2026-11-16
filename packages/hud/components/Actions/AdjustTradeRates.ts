import Action from './Action';
import LockedSlider from '@civ-clone/ui-widgets/components/LockedSlider';
import LockedSliderGroup from '@civ-clone/ui-widgets/components/LockedSliderGroup';
import { PlayerTradeRates } from '@civ-clone/ui-protocol/types';
import Transport from '@civ-clone/ui-client/Transport';
import Window from '@civ-clone/ui-component-window/Window';
import { assetStore } from '@civ-clone/ui-assets/AssetStore';
import { s } from '@dom111/element';
import { t } from 'i18next';
import currentTileset from '@civ-clone/ui-assets/lib/tilesets';
import { spriteKey } from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';

// The key the button's tooltip shows. `-` opens the window too (#662).
export const tradeRatesKey = '+';

let open: Window | null = null;

/**
 * Opens the Adjust trade rates window for the player's `tradeRates`, which sends the rates chosen when it closes, for
 * the button and the `+` and `-` keys alike (#662). The window isn't modal, so one already open is brought forward
 * rather than a second one opened, whose close would send its own rates over the first's.
 */
export const openTradeRates = (
  tradeRates: PlayerTradeRates,
  transport: Transport
): Window => {
  if (open !== null && open.element().isConnected) {
    open.element().focus();

    return open;
  }

  const sliders: LockedSlider[] = [],
    rateName = (rate: string): string =>
      t(`${rate}.name`, { defaultValue: rate, ns: 'trade' }),
    // A rate worth less than it's set to, under this government (Civ2's Fundamentalism and research).
    limited = Object.entries(tradeRates.limitedRates ?? {}).map(
      ([rate, limit]) => {
        const note = s('<p class="adjust-trade-rates-limit"></p>');

        note.textContent = t('Actions.AdjustTradeRates.limited', {
          rate: rateName(rate),
          limit,
        });

        return note;
      }
    );

  const window = new Window(
    t('Actions.AdjustTradeRates.title'),
    s(
      '<div></div>',
      ...tradeRates.all.map((tradeRate) => {
        // Each stops at its maximum, where the rules have one (Civ2's, M2d).
        const slider = new LockedSlider(
          tradeRate._,
          tradeRate.value,
          rateName(tradeRate._),
          tradeRates.maxRates?.[tradeRate._] ?? 100
        );

        sliders.push(slider);

        return slider;
      }),
      ...limited
    ),
    {
      classes: 'adjust-trade-rates',
    }
  );

  const sliderGroup = new LockedSliderGroup(...sliders);

  window.on('close', () => {
    if (open === window) {
      open = null;
    }

    const value = sliderGroup
      .sliders()
      .map((slider): [string, number] => [slider.key(), slider.value()]);

    // Rates held by their maximums that can't come to 100 can't be set: they're left as they were.
    if (
      Object.keys(tradeRates.maxRates ?? {}).length > 0 &&
      !sliderGroup.balanced()
    ) {
      return;
    }

    transport.send('action', {
      name: 'AdjustTradeRates',
      id: tradeRates.id,
      value,
    });
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
      .spriteURL(spriteKey(currentTileset(), 'city/trade'))
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
