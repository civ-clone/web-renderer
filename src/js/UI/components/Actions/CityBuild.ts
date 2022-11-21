import { CityBuild as CityBuildObject, PlayerAction } from '../../types';
import Action from './Action';
import CityBuildSelectionWindow from '../CityBuildSelectionWindow';
import Portal from '../Portal';
import Transport from '../../../Engine/Transport';
import { assetStore } from '../../AssetStore';
import { s } from '@dom111/element';

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
        showCity: CityBuildSelectionWindow.showCityAction(
          this.value().city,
          this.#portal,
          this.transport()
        ),
        showCityOnMap: CityBuildSelectionWindow.showCityOnMapAction(
          this.value().city,
          this.#portal
        ),
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
            `<button class="cityBuild" title="What would you like to build in ${
              cityBuild.city.name
            }?" style="background-image:url('${asset!.uri}')">`
          )
        )
      );
  }

  value(): CityBuildObject {
    return super.value() as CityBuildObject;
  }
}

export default CityBuild;
