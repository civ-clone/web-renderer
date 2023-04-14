import { CityBuild as CityBuildObject, PlayerAction } from '../../types';
import Action from './Action';
import CityBuildSelectionWindow from '../CityBuildSelectionWindow';
import Portal from '../Portal';
import Transport from '../../Transport';
import { assetStore } from '../../AssetStore';
import { cityName } from '../lib/city';
import { s } from '@dom111/element';
import showCityAction from '../lib/showCityAction';
import showCityOnMapAction from '../lib/showCityOnMap';
import { t } from 'i18next';

export class CityBuild extends Action {
  #portal: Portal;

  constructor(action: PlayerAction, portal: Portal, transport: Transport) {
    super(action, transport);

    this.#portal = portal;
  }

  activate(): void {
    new CityBuildSelectionWindow(
      this.value(),
      this.transport(),
      () => this.complete(),
      {
        showCity: showCityAction(
          this.value().city,
          this.#portal,
          this.transport()
        ),
        showCityOnMap: showCityOnMapAction(this.value().city, this.#portal),
      }
    );
  }

  build(): void {
    const cityBuild = this.value();

    assetStore.get('./assets/city/production.png').then((asset) =>
      this.append(
        s(
          `<button class="large cityBuild" title="${t(
            'Actions.CityBuildSelectionWindow.title',
            {
              cityName: cityName(cityBuild.city),
            }
          )}"><img src="${asset!.uri}"></button>`
        )
      )
    );
  }

  value(): CityBuildObject {
    return super.value() as CityBuildObject;
  }
}

export default CityBuild;
