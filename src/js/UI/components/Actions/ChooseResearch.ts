import Action from './Action';
import { PlayerResearch } from '../../types';
import SelectionWindow from '../SelectionWindow';
import { e } from '../../lib/html';
import { assetStore } from '../../AssetStore';

export class ChooseResearch extends Action {
  public activate(): void {
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
        this.element().append(
          e(
            `button.chooseResearch[title="Choose research"][style="background-image:url('${
              asset!.uri
            }')"]`
          )
        )
      );
  }

  value(): PlayerResearch {
    return super.value() as PlayerResearch;
  }
}

export default ChooseResearch;
