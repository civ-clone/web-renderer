import Action from './Action';
import checkIcon from 'feather-icons/dist/icons/check-circle.svg';
import { s } from '@dom111/element';
import { t } from 'i18next';

export class EndTurn extends Action {
  activate(): void {
    this.element().setAttribute('disabled', '');

    this.transport().send('action', {
      name: 'EndTurn',
    });
  }

  build(): void {
    this.append(
      s(
        `<button class="large gradient endTurn" title="${t(
          'Actions.EndTurn.title'
        )}"><img src="${checkIcon}"</button>`
      )
    );
  }
}

export default EndTurn;
