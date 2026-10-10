import {
  difficultyLabels,
  preselectedDifficulty,
  rememberDifficulty,
} from '../lib/difficulty';
import Difficulties from '../../Engine/Requests/Difficulties';
import MandatorySelection from './MandatorySelection';
import Transport from '../Transport';
import { t } from 'i18next';

/**
 * The difficulty level, asked after the size of the world and before the number of civilizations, as Civ1 asks it
 * (#173). The levels come from the rules, easiest first, and the list starts on the player's last choice, or Prince.
 */
export class DifficultyWindow extends MandatorySelection {
  constructor(
    levels: { label: string; value: string }[],
    preselected: string,
    onChoose: (difficulty: string) => void
  ) {
    super(
      t('DifficultyWindow.title'),
      levels,
      (selection) => {
        this.close();

        rememberDifficulty(selection);

        onChoose(selection);
      },
      undefined,
      {
        modal: true,
      }
    );

    this.selectionList().value = preselected;
  }

  /** Asks the worker for the levels, then the player for one. */
  static ask(transport: Transport, onChoose: (difficulty: string) => void) {
    transport
      .request(new Difficulties())
      .then((levels) => {
        if (levels.length === 0) {
          // Rules with no levels: there's nothing to ask.
          onChoose('');

          return;
        }

        new DifficultyWindow(
          difficultyLabels(levels),
          preselectedDifficulty(levels),
          onChoose
        );
      })
      .catch((error: Error) => console.error(error));
  }
}

export default DifficultyWindow;
