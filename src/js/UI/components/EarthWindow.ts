import { FinishedHandler, NewGameWindow } from './NewGameWindow';
import Transport from '../Transport';
import { earthWorldSizes } from '../lib/worldSizes';

/** A new game on Earth: the same questions as New Game, offering only the sizes there is an Earth map for. */
export class EarthWindow extends NewGameWindow {
  constructor(transport: Transport, onFinished?: FinishedHandler) {
    super(transport, onFinished, earthWorldSizes, { earth: true });
  }
}

export default EarthWindow;
