import {
  WorldSize,
  defaultWorldSize,
  playerCounts,
  worldSizes,
} from '../lib/worldSizes';
import DifficultyWindow from './DifficultyWindow';
import MandatorySelection from './MandatorySelection';
import PlayerCountWindow from './PlayerCountWindow';
import Transport from '../Transport';
import { t } from 'i18next';

export type FinishedHandler = () => void;

/**
 * The size of the world, then the difficulty level (#173), then how many civilizations to play with (#55). `sizes`
 * are the sizes to offer, and `worldOptions` go to the engine with the answers (Earth offers only the sizes it has a
 * map for, and adds `earth`).
 */
export class NewGameWindow extends MandatorySelection {
  constructor(
    transport: Transport,
    onFinished?: FinishedHandler,
    sizes: WorldSize[] = worldSizes,
    worldOptions: { [key: string]: any } = {}
  ) {
    super(
      t('NewGameWindow.world-size'),
      sizes.map(({ key, width, height }) => ({
        label: t(`NewGameWindow.WorldSize.${key}`, { width, height }) as string,
        value: key,
      })),
      (selection) => {
        this.close();

        const size =
          sizes.find(({ key }) => key === selection) ?? defaultWorldSize;

        DifficultyWindow.ask(
          transport,
          (difficulty) =>
            new PlayerCountWindow(
              transport,
              {
                ...worldOptions,
                width: size.width,
                height: size.height,
                difficulty,
              },
              playerCounts(size),
              size.players,
              onFinished
            )
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
