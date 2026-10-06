import { FinishedHandler, PlayerCountWindow } from './PlayerCountWindow';
import Transport from '../Transport';

// Earth is a fixed map, so there is no size to ask for (#55): only how many civilizations.
export class EarthWindow extends PlayerCountWindow {
  constructor(transport: Transport, onFinished?: FinishedHandler) {
    super(
      transport,
      {
        width: 80,
        height: 50,
        earth: true,
      },
      [7, 6, 5, 4, 3],
      7,
      onFinished
    );
  }
}

export default EarthWindow;
