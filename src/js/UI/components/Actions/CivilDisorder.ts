import { City, PlayerAction } from '../../types';
import Action from './Action';
import ActionWindow from '../ActionWindow';
import Portal from '../Portal';
import Transport from '../../Transport';
import { assetStore } from '../../AssetStore';
import { s } from '@dom111/element';
import showCityAction from '../lib/showCityAction';
import showCityOnMapAction from '../lib/showCityOnMap';
import { t } from 'i18next';
import currentTileset from '../../lib/tilesets';
import { spriteKey } from '../../tilesets/TilesetDescriptor';

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
            `<button class="civilDisorder" title="${t(
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
