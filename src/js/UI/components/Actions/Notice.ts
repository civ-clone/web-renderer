import Action from './Action';
import ActionWindow from '../ActionWindow';
import { Notice as NoticeData } from '../Notices';
import { PlayerAction } from '../../types';
import Portal from '../Portal';
import Transport from '../../Transport';
import { assetStore } from '../../AssetStore';
import { drawUnitActionIcon } from '../../lib/unitActionIcon';
import { s } from '@dom111/element';
import showCityAction from '../lib/showCityAction';
import showCityOnMapAction from '../lib/showCityOnMap';
import { t } from 'i18next';
import currentTileset from '../../lib/tilesets';
import { spriteKey } from '../../tilesets/TilesetDescriptor';

const cityNotices = [
  'City.captured-from-us',
  'City.destroyed',
  'City.destroyed-by',
];

export class Notice extends Action {
  #portal: Portal;

  constructor(action: PlayerAction, portal: Portal, transport: Transport) {
    super(action, transport);

    this.#portal = portal;
  }

  activate(): void {
    const { city, dismiss } = this.value() as unknown as NoticeData;

    dismiss();

    new ActionWindow(this.text('title'), this.text('body'), {
      actions: city
        ? {
            showCity: showCityAction(city, this.#portal, this.transport()),
            showCityOnMap: showCityOnMapAction(city, this.#portal),
          }
        : {},
    });

    this.complete();
  }

  build(): void {
    const { colours, notification } = this.value() as unknown as NoticeData;

    // A city we've lost is one of our cities on the map, with no size (#420).
    if (cityNotices.includes(notification.key)) {
      const button = s(
        `<button class="btn-bare notice" title="${this.text(
          'title'
        )}"><canvas width="16" height="16"></canvas></button>`
      );

      this.append(button);

      // Not in the page yet, so drawn at the sprite's own size and enlarged pixel by pixel by the stylesheet.
      drawUnitActionIcon(button.querySelector('canvas')!, [
        { type: 'city', text: null, colours },
      ]);

      return;
    }

    // TODO: an icon per notice, e.g. the Wonder's own, once those are extracted (#64).
    assetStore
      .spriteURL(spriteKey(currentTileset(), 'city/luxury'))
      .then((url) =>
        this.append(
          s(
            `<button class="btn-bare notice" title="${this.text(
              'title'
            )}"><img src="${url}"></button>`
          )
        )
      );
  }

  // Its title and body, as the notice's window shows them: the Next Turn button names it by its title (#702).
  text(part: 'body' | 'title'): string {
    const { notification } = this.value() as unknown as NoticeData;

    return t(`${notification.key}.${part}`, {
      ...notification.data,
      defaultValue: part === 'title' ? t('Notification.title') : undefined,
      ns: 'notification',
      skipOnVariables: false,
    }) as unknown as string;
  }
}

export default Notice;
