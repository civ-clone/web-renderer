import MandatorySelection from './MandatorySelection';
import Transport from '../Transport';
import Request from '../../Engine/Request';
import { t } from 'i18next';
import { unlessRequestFailed } from '../lib/unlessRequestFailed';

export type FinishedHandler = () => void;

/**
 * How many civilizations to play with, the last question before a new game starts. `worldOptions` (the world's size,
 * or Earth) go to the engine with the answer.
 */
export class PlayerCountWindow extends MandatorySelection {
  constructor(
    transport: Transport,
    worldOptions: { [key: string]: any },
    counts: number[],
    selected: number,
    onFinished?: FinishedHandler
  ) {
    super(
      t('NewGameWindow.number-of-players'),
      counts.map((value) => ({
        label: t('NewGameWindow.civilizations', {
          count: value,
        }) as string,
        value,
      })),
      async (selection) => {
        this.close();

        try {
          await transport.request(
            new Request('setOptions', {
              ...worldOptions,
              players: parseInt(selection, 10),
            })
          );
        } catch (error) {
          // Not answered: the player has been told, and the main menu is still there, with no game started (#580).
          unlessRequestFailed(error);

          return;
        }

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

    this.selectionList().value = String(selected);
  }
}

export default PlayerCountWindow;
