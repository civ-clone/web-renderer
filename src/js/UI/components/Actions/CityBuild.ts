import { CityBuild as CityBuildObject, PlayerAction } from '../../types';
import Action from './Action';
import CityBuildAvailable from '../../../Engine/Requests/CityBuildAvailable';
import { openCityBuild } from '../choices';
import Portal from '../Portal';
import Transport from '../../Transport';
import { assetStore } from '../../AssetStore';
import { s } from '@dom111/element';
import showCityAction from '../lib/showCityAction';
import showCityOnMapAction from '../lib/showCityOnMap';
import { t } from 'i18next';
import { unlessRequestFailed } from '../../lib/unlessRequestFailed';
import currentTileset from '../../lib/tilesets';
import { spriteKey } from '../../tilesets/TilesetDescriptor';

export class CityBuild extends Action {
  // Whether the picker is waiting for what the city can build (#484).
  #opening = false;
  #portal: Portal;

  constructor(action: PlayerAction, portal: Portal, transport: Transport) {
    super(action, transport);

    this.#portal = portal;
  }

  async activate(): Promise<void> {
    // Pressed again before the first answer came: one picker is enough (#484).
    if (this.#opening) {
      return;
    }

    this.#opening = true;

    let available;

    try {
      available = await this.transport().request(
        new CityBuildAvailable(this.value().id)
      );
    } catch (error) {
      // Not answered: the player has been told, and can press it again (#580).
      unlessRequestFailed(error);

      return;
    } finally {
      this.#opening = false;
    }

    openCityBuild(
      this.value(),
      available,
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
      .spriteURL(spriteKey(currentTileset(), 'city/production'))
      .then((url) =>
        this.append(
          s(
            `<button class="btn-bare large cityBuild" title="${t(
              'Actions.CityBuildSelectionWindow.title',
              {
                city: cityBuild.city,
              }
            )}"><img src="${url}"></button>`
          )
        )
      );
  }

  value(): CityBuildObject {
    return super.value() as CityBuildObject;
  }
}

export default CityBuild;
