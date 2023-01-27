import Action from './Action';
import checkIcon from 'feather-icons/dist/icons/check-circle.svg';
import { s } from '@dom111/element';

export class EndTurn extends Action {
  activate(): void {
    this.transport().send('action', {
      name: 'EndTurn',
    });
  }

  build(): void {
    this.append(
      s(
        `<button class="large gradient endTurn" title="End turn"><img src="${checkIcon}"</button>`
      )
    );
  }
}

export default EndTurn;
