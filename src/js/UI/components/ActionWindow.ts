import {
  INotificationWindow,
  NotificationWindow,
  NotificationWindowOptions,
} from './NotificationWindow';
import { h } from '../lib/html';
import { s } from '@dom111/element';

export interface ActionWindowAction {
  label: string;
  action: (window: INotificationWindow) => void;
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
          label: 'OK',
          action: (actionWindow) => actionWindow.close(),
          ...(options.actions?.primary ?? {}),
        },
        ...options.actions,
      },
    };

    super(
      title,
      s(
        '<div></div>',
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
