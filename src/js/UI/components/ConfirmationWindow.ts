import {
  NotificationWindow,
  NotificationWindowOptions,
} from './NotificationWindow';
import { h } from '../lib/html';
import { s } from '@dom111/element';

export interface ConfirmationWindowOptions extends NotificationWindowOptions {
  okLabel?: string;
  cancelLabel?: string;
}

export class ConfirmationWindow extends NotificationWindow {
  constructor(
    title: string,
    details: string,
    onOK: () => void,
    options: ConfirmationWindowOptions = {}
  ) {
    const confirmationButton = h(
      s(`<button>${options.okLabel ?? 'OK'}</button>`),
      {
        click: () => {
          onOK();

          this.close();
        },
        keydown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();

            onOK();

            this.close();
          }
        },
      }
    );

    super(
      title,
      s(
        `<div class="content"><p>${details}</p></div>`,
        s(
          '<footer></footer>',
          confirmationButton,
          h(s(`<button>${options.cancelLabel ?? 'Cancel'}</button>`), {
            click: () => this.close(),
            keydown: (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();

                this.close();
              }
            },
          })
        )
      ),
      {
        ...options,
        queue: false,
      }
    );

    confirmationButton.focus();
  }
}

export default ConfirmationWindow;
