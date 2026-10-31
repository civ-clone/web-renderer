import Action from './Action';
import LockedSlider from '../LockedSlider';
import LockedSliderGroup from '../LockedSliderGroup';
import { PlayerTradeRates } from '../../types';
import Transport from '../../Transport';
import Window from '../Window';
import { assetStore } from '../../AssetStore';
import { s } from '@dom111/element';
import { t } from 'i18next';
import currentTileset from '../../lib/tilesets';
import { spriteKey } from '../../tilesets/TilesetDescriptor';

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

  const sliders: LockedSlider[] = [];

  const window = new Window(
    t('Actions.AdjustTradeRates.title'),
    s(
      '<div></div>',
      ...tradeRates.all.map((tradeRate) => {
        const slider = new LockedSlider(
          tradeRate._,
          tradeRate.value,
          t(`${tradeRate._}.name`, {
            defaultValue: tradeRate._,
            ns: 'trade',
          })
        );

        sliders.push(slider);

        return slider;
      })
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
  activate(): void {
    openTradeRates(this.value(), this.transport());
  }

  build(): void {
    assetStore
      .spriteURL(spriteKey(currentTileset(), 'city/trade'))
      .then((url) =>
        this.append(
          s(
            `<button class="btn-bare adjustTradeRates small" aria-keyshortcuts="${tradeRatesKey}" title="${t(
              'Actions.AdjustTradeRates.title'
            )}"><img src="${url}"></button>`
          )
        )
      );
  }

  value(): PlayerTradeRates {
    return super.value() as PlayerTradeRates;
  }
}

export default AdjustTradeRates;
