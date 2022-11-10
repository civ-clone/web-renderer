import Action from './Action';
import LockedSlider from '../LockedSlider';
import LockedSliderGroup from '../LockedSliderGroup';
import { PlayerTradeRates } from '../../types';
import Transport from '../../../../client/Transport';
import Window from '../Window';
import { e } from '../../lib/html';

declare var transport: Transport;

export class AdjustTradeRates extends Action {
  #sliderGroup: LockedSliderGroup | undefined;

  public activate(): void {
    const sliders: LockedSlider[] = [];

    const window = new Window(
      'Adjust trade rates',
      e(
        'div',
        ...this.value().all.map((tradeRate) => {
          const slider = new LockedSlider(tradeRate._, tradeRate.value * 100);

          sliders.push(slider);

          return slider.element();
        })
      )
    );

    window.element().addEventListener('close', () => {
      transport.send('action', {
        name: 'AdjustTradeRates',
        id: this.value().id,
        value: this.#sliderGroup!.sliders().map((slider) => [
          slider.label(),
          parseFloat((slider.value() / 100).toFixed(2)),
        ]),
      });
    });

    this.#sliderGroup = new LockedSliderGroup(...sliders);
  }

  build(): void {
    this.element().append(
      e('button.adjustTradeRates[title="Adjust trade rates"]')
    );
  }

  value(): PlayerTradeRates {
    return super.value() as PlayerTradeRates;
  }
}

export default AdjustTradeRates;
