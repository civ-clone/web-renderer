import Action from './Action';
import { PlayerGovernment } from '../../types';
import SelectionWindow from '../SelectionWindow';
import { assetStore } from '../../AssetStore';
import { s } from '@dom111/element';

export class Revolution extends Action {
  activate(): void {
    const chooseWindow = new SelectionWindow(
      'Choose government',
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
      'Which government would you like to convert to?',
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
            `<button class="chooseGovernment small" title="Choose government"><img src="${
              asset!.uri
            }"></button>`
          )
        )
      );
  }

  value(): PlayerGovernment {
    return super.value() as PlayerGovernment;
  }
}

export default Revolution;
