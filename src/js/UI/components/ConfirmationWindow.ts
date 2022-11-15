import {
  NotificationWindow,
  NotificationWindowOptions,
} from './NotificationWindow';
import { e, h, t } from '../lib/html';

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
    const confirmationButton = h(e('button', t(options.okLabel ?? 'OK')), {
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
    });

    super(
      title,
      e(
        'div.content',
        e('p', t(details)),
        e(
          'footer',
          confirmationButton,
          h(e('button', t(options.cancelLabel ?? 'Cancel')), {
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
