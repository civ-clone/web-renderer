import {
  NotificationWindow,
  NotificationWindowOptions,
} from './NotificationWindow';
import { h } from '../lib/html';
import { s } from '@dom111/element';
import { t } from 'i18next';

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
      s(`<button>${t(options.okLabel ?? 'Generic.ok')}</button>`),
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
          h(
            s(`<button>${t(options.cancelLabel ?? 'Generic.cancel')}</button>`),
            {
              click: () => this.close(),
              keydown: (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();

                  this.close();
                }
              },
            }
          )
        )
      ),
      {
        classes: 'confirmationWindow',
        ...options,
        queue: false,
      }
    );

    confirmationButton.focus();
  }
}

export default ConfirmationWindow;
