import {
  INotificationWindow,
  NotificationWindow,
  NotificationWindowOptions,
} from './NotificationWindow';
import { ButtonVariant, button } from '../lib/button';
import { h } from '../lib/html';
import { s } from '@dom111/element';
import { t } from 'i18next';

export interface ActionWindowAction {
  label: string;
  action: (window: INotificationWindow) => void;
  // Escape chooses this one (#659).
  cancel?: boolean;
  // Its look (#740): by default `primary` for the window's primary action, `quiet` for the cancel one, `secondary` else.
  variant?: ButtonVariant;
}

export interface ActionWindowActions {
  [key: string]: ActionWindowAction;
}

export interface ActionWindowOptions extends NotificationWindowOptions {
  actions?: ActionWindowActions;
}

export class ActionWindow extends NotificationWindow {
  constructor(
    title: string,
    body: string | Node,
    options: ActionWindowOptions = {}
  ) {
    options = {
      classes: 'actionWindow',
      ...options,
      actions: {
        primary: {
          label: t('Generic.ok'),
          action: (actionWindow) => actionWindow.close(),
          ...(options.actions?.primary ?? {}),
        },
        ...options.actions,
      },
    };

    const cancel = Object.values(options.actions!).find(
      (action) => action.cancel
    );

    if (cancel) {
      options.cancel = () => cancel.action(this);
    }

    super(
      title,
      s(
        // Laid out in `_window.scss`, so the buttons stay in view and only the content scrolls (#634).
        '<div class="action-window-content"></div>',
        ...(body instanceof Node
          ? [body]
          : body === null
          ? []
          : [s(`<p>${body}</p>`)]),
        s(
          '<footer></footer>',
          ...Object.entries(options.actions!).map(
            ([key, { label, action, cancel = false, variant }]) =>
              h(
                button(label, {
                  variant:
                    variant ??
                    (cancel
                      ? 'quiet'
                      : key === 'primary'
                      ? 'primary'
                      : 'secondary'),
                  hotkey: cancel ? 'Escape' : null,
                }),
                {
                  click: () => action(this),
                  keydown: (event) => {
                    if (event.key === 'Enter') {
                      action(this);
                    }
                  },
                }
              )
          )
        )
      ),
      options
    );
  }
}

export default ActionWindow;
