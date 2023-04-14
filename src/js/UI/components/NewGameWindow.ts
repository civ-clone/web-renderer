import MandatorySelection from './MandatorySelection';
import Transport from '../Transport';
import Request from '../../Engine/Request';
import { t } from 'i18next';

export type FinishedHandler = () => void;

export class NewGameWindow extends MandatorySelection {
  constructor(transport: Transport, onFinished?: FinishedHandler) {
    super(
      t('NewGameWindow.number-of-players'),
      [7, 6, 5, 4, 3].map((value) => ({
        label: t('NewGameWindow.civilizations', {
          count: value,
        }) as string,
        value,
      })),
      async (selection) => {
        this.close();

        await transport.request(
          new Request('setOptions', {
            width: 80,
            height: 60,
            players: parseInt(selection, 10),
          })
        );

        if (onFinished) {
          await onFinished();
        }

        transport.send('start', null);
      },
      undefined,
      {
        modal: true,
      }
    );
  }
}

export default NewGameWindow;
