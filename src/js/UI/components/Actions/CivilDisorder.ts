import { City, PlayerAction } from '../../types';
import Action from './Action';
import ActionWindow from '../ActionWindow';
import Portal from '../Portal';
import Transport from '../../Transport';
import { assetStore } from '../../AssetStore';
import { s } from '@dom111/element';
import showCityAction from '../lib/showCityAction';
import showCityOnMapAction from '../lib/showCityOnMap';

export class CivilDisorder extends Action {
  #portal: Portal;

  constructor(action: PlayerAction, portal: Portal, transport: Transport) {
    super(action, transport);

    this.#portal = portal;
  }

  activate() {
    const city = this.value() as unknown as City;

    new ActionWindow(
      `Civil disorder in ${city.name}!`,
      `Civil disorder in ${city.name}, mayor flees in panic!`,
      {
        actions: {
          showCity: showCityAction(city, this.#portal, this.transport()),
          showCityOnMap: showCityOnMapAction(city, this.#portal),
        },
      }
    );
  }

  build() {
    const city = this.value() as unknown as City;

    assetStore
      .get('./assets/city/people_unhappy_m.png')
      .then((asset) =>
        this.append(
          s(
            `<button class="civilDisorder" title="Civil disorder in ${
              city.name
            }!"><img src="${asset!.uri}"></button>`
          )
        )
      );
  }
}

export default CivilDisorder;
