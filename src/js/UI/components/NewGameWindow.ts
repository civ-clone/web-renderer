import MandatorySelection from './MandatorySelection';
import Transport from '../Transport';
import Request from '../../Engine/Request';

export type FinishedHandler = () => void;

export class NewGameWindow extends MandatorySelection {
  constructor(transport: Transport, onFinished?: FinishedHandler) {
    // TODO: take the number from Engine options.
    super(
      'How many players?',
      [
        {
          label: '7 civilizations',
          value: 7,
        },
        {
          label: '6 civilizations',
          value: 6,
        },
        {
          label: '5 civilizations',
          value: 5,
        },
        {
          label: '4 civilizations',
          value: 4,
        },
        {
          label: '3 civilizations',
          value: 3,
        },
      ],
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
      }
    );
  }
}

export default NewGameWindow;
