import Action from './Action';
import { e } from '../../lib/html';

export class EndTurn extends Action {
  activate(): void {
    this.transport().send('action', {
      name: 'EndTurn',
    });
  }

  build(): void {
    this.element().append(e(`button.endTurn[title="End turn"]`));
  }
}

export default EndTurn;
