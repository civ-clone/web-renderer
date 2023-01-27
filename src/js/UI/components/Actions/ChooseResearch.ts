import Action from './Action';
import { PlayerResearch } from '../../types';
import SelectionWindow from '../SelectionWindow';
import { assetStore } from '../../AssetStore';
import { s } from '@dom111/element';

export class ChooseResearch extends Action {
  activate(): void {
    const chooseWindow = new SelectionWindow(
      'Choose research',
      this.value().available.map((advance) => ({
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
      'Which advance would you like to research next?',
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
            `<button class="large chooseResearch" title="Choose research"><img src="${
              asset!.uri
            }"></button>`
          )
        )
      );
  }

  value(): PlayerResearch {
    return super.value() as PlayerResearch;
  }
}

export default ChooseResearch;
