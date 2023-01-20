import { CityBuild as CityBuildObject, PlayerAction } from '../../types';
import Action from './Action';
import CityBuildSelectionWindow from '../CityBuildSelectionWindow';
import Portal from '../Portal';
import Transport from '../../../Engine/Transport';
import { assetStore } from '../../AssetStore';
import { s } from '@dom111/element';
import showCityAction from '../lib/showCityAction';
import showCityOnMapAction from '../lib/showCityOnMap';

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

    assetStore
      .get('./assets/city/production.png')
      .then((asset) =>
        this.append(
          s(
            `<button class="large gradient cityBuild" title="What would you like to build in ${
              cityBuild.city.name
            }?"><img src="${asset!.uri}"></button>`
          )
        )
      );
  }

  value(): CityBuildObject {
    return super.value() as CityBuildObject;
  }
}

export default CityBuild;
