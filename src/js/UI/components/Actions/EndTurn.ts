import Action from './Action';
import checkIcon from 'feather-icons/dist/icons/check-circle.svg';
import { s } from '@dom111/element';
import { t } from 'i18next';

export class EndTurn extends Action {
  activate(): void {
    // `element()` is the wrapping `.action` div, and `disabled` means nothing
    // on a `div`: it has to go on the `button` (#11). Both the click handler
    // and the keyboard handler in `Actions` route here, and the turn ends
    // once, so a second press must not reach the transport — the panel is
    // rebuilt with a fresh `EndTurn` when the next turn's actions arrive.
    const button = this.element().querySelector('button');

    if (!button || button.disabled) {
      return;
    }

    button.disabled = true;

    this.transport().send('action', {
      name: 'EndTurn',
    });
  }

  build(): void {
    this.append(
      s(
        `<button class="large gradient endTurn" title="${t(
          'Actions.EndTurn.title'
        )}"><img src="${checkIcon}"></button>`
      )
    );
  }
}

export default EndTurn;
