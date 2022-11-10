import Action from './Action';
import { PlayerGovernment } from '../../types';
import SelectionWindow from '../SelectionWindow';
import Transport from '../../../../client/Transport';
import { e } from '../../lib/html';

declare var transport: Transport;

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

        transport.send('action', {
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
    this.element().append(
      e('button.chooseGovernment[title="Choose government"]')
    );
  }

  value(): PlayerGovernment {
    return super.value() as PlayerGovernment;
  }
}

export default Revolution;
