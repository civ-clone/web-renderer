import Action from './Action';
import { PlayerGovernment } from '../../types';
import SelectionWindow from '../SelectionWindow';
import { assetStore } from '../../AssetStore';
import { s } from '@dom111/element';
import { t } from 'i18next';

export class Revolution extends Action {
  activate(): void {
    const chooseWindow = new SelectionWindow(
      t('Actions.Revolution.title'),
      this.value().available.map((government) => ({
        value: government._,
      })),
      (selection) => {
        if (!selection) {
          return;
        }

        this.transport().send('action', {
          name: 'Revolution',
          id: this.value().id,
          chosen: selection ? selection : '@',
        });

        this.complete();

        chooseWindow.close();
      },
      t('Actions.Revolution.body'),
      {
        displayAll: true,
      }
    );
  }

  build(): void {
    assetStore
      .get('./assets/city/sad.png')
      .then((asset) =>
        this.append(
          s(
            `<button class="chooseGovernment small" title="${t(
              'Actions.Revolution.title'
            )}"><img src="${asset!.uri}"></button>`
          )
        )
      );
  }

  value(): PlayerGovernment {
    return super.value() as PlayerGovernment;
  }
}

export default Revolution;
