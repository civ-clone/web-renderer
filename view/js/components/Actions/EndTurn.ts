import Action from './Action';
import Transport from '../../../../client/Transport';
import { e } from '../../lib/html';

declare var transport: Transport;

export class EndTurn extends Action {
  activate(): void {
    transport.send('action', {
      name: 'EndTurn',
    });
  }

  build(): void {
    this.element().append(e(`button.endTurn[title="End turn"]`));
  }
}

export default EndTurn;
