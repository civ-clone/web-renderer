import { FinishedHandler, PlayerCountWindow } from './PlayerCountWindow';
import DifficultyWindow from './DifficultyWindow';
import Transport from '../Transport';

// Earth is a fixed map, so there is no size to ask for (#55): only the difficulty level (#173) and how many
//  civilizations.
export class EarthWindow {
  constructor(transport: Transport, onFinished?: FinishedHandler) {
    DifficultyWindow.ask(
      transport,
      (difficulty) =>
        new PlayerCountWindow(
          transport,
          {
            width: 80,
            height: 50,
            earth: true,
            difficulty,
          },
          [7, 6, 5, 4, 3],
          7,
          onFinished
        )
    );
  }
}

export default EarthWindow;
