import Action from './Action';
import { PlayerResearch } from '../../types';
import SelectionWindow from '../SelectionWindow';
import Transport from '../../../../client/Transport';
import { e } from '../../lib/html';

declare var transport: Transport;

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

        transport.send('action', {
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
    this.element().append(e('button.chooseResearch[title="Choose research"]'));
  }

  value(): PlayerResearch {
    return super.value() as PlayerResearch;
  }
}

export default ChooseResearch;
