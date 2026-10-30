import Action from './Action';
import { PlayerGovernment } from '../../types';
import SelectionWindow from '../SelectionWindow';
import { assetStore } from '../../AssetStore';
import { s } from '@dom111/element';
import { t } from 'i18next';
import currentTileset from '../../lib/tilesets';
import { spriteKey } from '../../tilesets/TilesetDescriptor';

export class ChooseGovernment extends Action {
  activate(): void {
    const chooseWindow = new SelectionWindow(
      t('Actions.ChooseGovernment.title'),
      this.value().available.map((government) => ({
        label: t(`${government._}.name`, {
          defaultValue: government._,
          ns: 'government',
        }),
        value: government._,
      })),
      (selection) => {
        if (!selection) {
          return;
        }

        this.transport().send('action', {
          name: 'ChooseGovernment',
          id: this.value().id,
          chosen: selection,
        });

        this.complete();

        chooseWindow.close();
      },
      t('Actions.ChooseGovernment.body'),
      {
        displayAll: true,
      }
    );
  }

  build(): void {
    assetStore
      .spriteURL(spriteKey(currentTileset(), 'city/people_content_m'))
      .then((url) =>
        this.append(
          s(
            `<button class="large chooseGovernment" title="${t(
              'Actions.ChooseGovernment.title'
            )}"><img src="${url}"></button>`
          )
        )
      );
  }

  value(): PlayerGovernment {
    return super.value() as PlayerGovernment;
  }
}

export default ChooseGovernment;
