import { CityBuild as CityBuildObject, PlayerAction } from '../../types';
import { e, h } from '../../lib/html';
import Action from './Action';
import CityBuildSelectionWindow from '../CityBuildSelectionWindow';
import Portal from '../Portal';
import Transport from '../../../Engine/Transport';
import { assetStore } from '../../AssetStore';

export class CityBuild extends Action {
  #portal: Portal;

  constructor(action: PlayerAction, portal: Portal, transport: Transport) {
    super(action, transport);

    this.#portal = portal;
  }

  public activate(): void {
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
        this.element().append(
          e(
            `button.cityBuild[title="What would you like to build in ${
              cityBuild.city.name
            }?"][style="background-image:url('${asset!.uri}')"]`
          )
        )
      );
  }

  value(): CityBuildObject {
    return super.value() as CityBuildObject;
  }
}

export default CityBuild;
