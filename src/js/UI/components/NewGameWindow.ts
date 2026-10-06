import { defaultWorldSize, playerCounts, worldSizes } from '../lib/worldSizes';
import MandatorySelection from './MandatorySelection';
import PlayerCountWindow from './PlayerCountWindow';
import Transport from '../Transport';
import { t } from 'i18next';

export type FinishedHandler = () => void;

/** The size of the world, then how many civilizations to play with (#55). */
export class NewGameWindow extends MandatorySelection {
  constructor(transport: Transport, onFinished?: FinishedHandler) {
    super(
      t('NewGameWindow.world-size'),
      worldSizes.map(({ key, width, height }) => ({
        label: t(`NewGameWindow.WorldSize.${key}`, { width, height }) as string,
        value: key,
      })),
      (selection) => {
        this.close();

        const size =
          worldSizes.find(({ key }) => key === selection) ?? defaultWorldSize;

        new PlayerCountWindow(
          transport,
          { width: size.width, height: size.height },
          playerCounts(size),
          size.players,
          onFinished
        );
      },
      undefined,
      {
        modal: true,
      }
    );

    this.selectionList().value = defaultWorldSize.key;
  }
}

export default NewGameWindow;
