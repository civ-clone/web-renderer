import Action from './Action';
import { PlayerResearch } from '../../types';
import SelectionWindow from '../SelectionWindow';
import { assetStore } from '../../AssetStore';
import { s } from '@dom111/element';
import { t } from 'i18next';

export class ChooseResearch extends Action {
  activate(): void {
    const chooseWindow = new SelectionWindow(
      t('Actions.ChooseResearch.title'),
      this.value().available.map((advance) => ({
        label: `${t(`${advance._}.name`, {
          defaultValue: advance._,
          ns: 'science',
        })}`,
        value: advance._,
      })),
      (selection) => {
        if (!selection) {
          return;
        }

        this.transport().send('action', {
          name: 'ChooseResearch',
          id: this.value().id,
          chosen: selection ? selection : '@',
        });

        this.complete();

        chooseWindow.close();
      },
      t('Actions.ChooseResearch.body'),
      {
        displayAll: true,
      }
    );
  }

  build(): void {
    assetStore
      .get('./assets/city/bulb.png')
      .then((asset) =>
        this.append(
          s(
            `<button class="large chooseResearch" title="${t(
              'Actions.ChooseResearch.title'
            )}"><img src="${asset!.uri}"></button>`
          )
        )
      );
  }

  value(): PlayerResearch {
    return super.value() as PlayerResearch;
  }
}

export default ChooseResearch;
