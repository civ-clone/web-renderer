import Action from './Action';
import { PlayerGovernment } from '../../types';
import entryDetails from '../lib/choiceDetails';
import { openChoice } from '../choiceList';
import { assetStore } from '../../AssetStore';
import { s } from '@dom111/element';
import { t } from 'i18next';
import currentTileset from '../../lib/tilesets';
import { spriteKey } from '../../tilesets/TilesetDescriptor';

export class ChooseGovernment extends Action {
  activate(): void {
    openChoice(
      t('Actions.ChooseGovernment.title'),
      this.value().available.map(({ _: government }) => {
        const name = t(`${government}.name`, {
          defaultValue: government,
          ns: 'government',
        });

        return {
          value: government,
          label: name,
          primary: t('ChoiceWindow.Government.adopt', {
            government: name,
            interpolation: { escapeValue: false },
          }),
        };
      }),
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
      },
      {
        intro: t('Actions.ChooseGovernment.body'),
        classes: ['choose-government'],
        // What each government does (#183).
        describe: ({ value }) =>
          entryDetails(this.transport(), value, ['government']),
      }
    );
  }

  build(): void {
    assetStore
      .spriteURL(spriteKey(currentTileset(), 'city/people_content_m'))
      .then((url) =>
        this.append(
          s(
            `<button class="btn-bare large chooseGovernment" title="${t(
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
