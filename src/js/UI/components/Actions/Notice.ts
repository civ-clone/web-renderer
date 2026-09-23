import Action from './Action';
import ActionWindow from '../ActionWindow';
import { Notice as NoticeData } from '../Notices';
import { PlayerAction } from '../../types';
import Portal from '../Portal';
import Transport from '../../Transport';
import { assetStore } from '../../AssetStore';
import { s } from '@dom111/element';
import showCityAction from '../lib/showCityAction';
import showCityOnMapAction from '../lib/showCityOnMap';
import { t } from 'i18next';

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
    // TODO: an icon per notice, e.g. the Wonder's own, once those are extracted (#64).
    assetStore
      .get('./assets/city/luxury.png')
      .then((asset) =>
        this.append(
          s(
            `<button class="notice" title="${this.text('title')}"><img src="${
              asset!.uri
            }"></button>`
          )
        )
      );
  }

  private text(part: 'body' | 'title'): string {
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
