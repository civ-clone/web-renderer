import Action from './Action';
import ConfirmationWindow from '../ConfirmationWindow';
import { PlayerGovernment } from '../../types';
import { assetStore } from '../../AssetStore';
import { s } from '@dom111/element';
import { t } from 'i18next';

export class Revolution extends Action {
  activate(): void {
    new ConfirmationWindow(
      t('Actions.Revolution.title'),
      t('Actions.Revolution.body'),
      () => {
        this.transport().send('action', {
          name: 'Revolution',
          id: this.value().id,
        });

        this.complete();
      },
      {
        okLabel: 'Actions.Revolution.confirm',
      }
    );
  }

  build(): void {
    assetStore
      .get('./assets/city/sad.png')
      .then((asset) =>
        this.append(
          s(
            `<button class="revolution small" title="${t(
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
