import { City, PlayerAction } from '../../types';
import Action from './Action';
import ActionWindow from '../ActionWindow';
import Portal from '../Portal';
import Transport from '../../Transport';
import { assetStore } from '../../AssetStore';
import { cityName } from '../lib/city';
import { s } from '@dom111/element';
import showCityAction from '../lib/showCityAction';
import showCityOnMapAction from '../lib/showCityOnMap';
import { t } from 'i18next';

export class CivilDisorder extends Action {
  #portal: Portal;

  constructor(action: PlayerAction, portal: Portal, transport: Transport) {
    super(action, transport);

    this.#portal = portal;
  }

  activate() {
    const city = this.value() as City;

    new ActionWindow(
      t('Actions.CivilDisorder.title', {
        cityName: cityName(city),
      }),
      t('Actions.CivilDisorder.body', {
        cityName: cityName(city),
      })!,
      {
        actions: {
          showCity: showCityAction(city, this.#portal, this.transport()),
          showCityOnMap: showCityOnMapAction(city, this.#portal),
        },
      }
    );
  }

  build() {
    const city = this.value() as City;

    assetStore.get('./assets/city/people_unhappy_m.png').then((asset) =>
      this.append(
        s(
          `<button class="civilDisorder" title="${t(
            'Actions.CivilDisorder.title',
            {
              cityName: cityName(city),
            }
          )}"><img src="${asset!.uri}"></button>`
        )
      )
    );
  }
}

export default CivilDisorder;
