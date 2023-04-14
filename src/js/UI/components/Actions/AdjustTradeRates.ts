import Action from './Action';
import LockedSlider from '../LockedSlider';
import LockedSliderGroup from '../LockedSliderGroup';
import { PlayerTradeRates } from '../../types';
import Window from '../Window';
import { assetStore } from '../../AssetStore';
import { s } from '@dom111/element';
import { t } from 'i18next';

export class AdjustTradeRates extends Action {
  #sliderGroup: LockedSliderGroup | undefined;

  activate(): void {
    const sliders: LockedSlider[] = [];

    const window = new Window(
      t('Actions.AdjustTradeRates.title'),
      s(
        '<div></div>',
        ...this.value().all.map((tradeRate) => {
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
      )
    );

    window.on('close', () => {
      const value = this.#sliderGroup!.sliders().map(
        (slider): [string, number] => [slider.key(), slider.value()]
      );

      this.transport().send('action', {
        name: 'AdjustTradeRates',
        id: this.value().id,
        value,
      });
    });

    this.#sliderGroup = new LockedSliderGroup(...sliders);
  }

  build(): void {
    assetStore
      .get('./assets/city/trade.png')
      .then((asset) =>
        this.append(
          s(
            `<button class="adjustTradeRates small" title="${t(
              'Actions.AdjustTradeRates.title'
            )}"><img src="${asset!.uri}"></button>`
          )
        )
      );
  }

  value(): PlayerTradeRates {
    return super.value() as PlayerTradeRates;
  }
}

export default AdjustTradeRates;
