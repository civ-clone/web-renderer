import Action from './Action';
import { s } from '@dom111/element';

export class EndTurn extends Action {
  activate(): void {
    this.transport().send('action', {
      name: 'EndTurn',
    });
  }

  build(): void {
    this.append(s(`<button class="endTurn" title="End turn"></button>`));
  }
}

export default EndTurn;
