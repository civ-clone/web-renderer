import { FinishedHandler, NewGameWindow } from './NewGameWindow';
import Transport from '../Transport';
import { earthWorldSizes } from '../lib/worldSizes';

/**
 * A new game on Earth: the same questions as New Game, offering only the sizes there is an Earth map for. Earth's maps
 * are square, so it never asks which grid (#89).
 */
export class EarthWindow extends NewGameWindow {
  constructor(transport: Transport, onFinished?: FinishedHandler) {
    super(transport, onFinished, earthWorldSizes, {
      earth: true,
      topologyId: 'square',
    });
  }
}

export default EarthWindow;
