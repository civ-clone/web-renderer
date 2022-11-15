import Action from './Action';
import { PlayerGovernment } from '../../types';
import SelectionWindow from '../SelectionWindow';
import { e } from '../../lib/html';
import { assetStore } from '../../AssetStore';

export class Revolution extends Action {
  public activate(): void {
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
        this.element().append(
          e(
            `button.chooseGovernment[title="Choose government"][style="background-image:url('${
              asset!.uri
            }')"]`
          )
        )
      );
  }

  value(): PlayerGovernment {
    return super.value() as PlayerGovernment;
  }
}

export default Revolution;
