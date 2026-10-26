import {
  INotificationWindow,
  NotificationWindow,
  NotificationWindowOptions,
} from './NotificationWindow';
import { h } from '../lib/html';
import { s } from '@dom111/element';
import { t } from 'i18next';

export interface ActionWindowAction {
  label: string;
  action: (window: INotificationWindow) => void;
  // Escape chooses this one (#659).
  cancel?: boolean;
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
          ...Object.entries(options.actions!).map(([, { label, action }]) =>
            h(s(`<button>${label}</button>`), {
              click: () => action(this),
              keydown: (event) => {
                if (event.key === 'Enter') {
                  action(this);
                }
              },
            })
          )
        )
      ),
      options
    );
  }
}

export default ActionWindow;
