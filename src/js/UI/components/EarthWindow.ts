import { FinishedHandler, NewGameWindow } from './NewGameWindow';
import Transport from '../../Engine/Transport';
import Request from '../../Engine/Request';

export class EarthWindow extends NewGameWindow {
  constructor(transport: Transport, onFinished?: FinishedHandler) {
    super(transport, async () => {
      if (onFinished) {
        await onFinished();
      }

      await transport.request(
        new Request('setOptions', {
          width: 80,
          height: 50,
          earth: true,
        })
      );
    });
  }
}

export default EarthWindow;
