import { City, PlayerAction } from '@civ-clone/ui-protocol/types';
import Action from './Action';
import ActionWindow from '@civ-clone/ui-widgets/components/ActionWindow';
import Portal from '@civ-clone/ui-map/components/Portal';
import Transport from '@civ-clone/ui-client/Transport';
import { assetStore } from '@civ-clone/ui-assets/AssetStore';
import { s } from '@dom111/element';
import showCityAction from '../lib/showCityAction';
import showCityOnMapAction from '../lib/showCityOnMap';
import { t } from 'i18next';
import currentTileset from '@civ-clone/ui-assets/lib/tilesets';
import { spriteKey } from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';

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
        city,
      }),
      t('Actions.CivilDisorder.body', {
        city,
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

    assetStore
      .spriteURL(spriteKey(currentTileset(), 'city/people_unhappy_m'))
      .then((url) =>
        this.append(
          s(
            `<button class="btn-bare civilDisorder" title="${t(
              'Actions.CivilDisorder.title',
              {
                city,
              }
            )}"><img src="${url}"></button>`
          )
        )
      );
  }
}

export default CivilDisorder;
