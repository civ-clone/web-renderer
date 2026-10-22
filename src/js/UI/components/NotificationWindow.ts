import { Window, IWindow, WindowOptions } from './Window';

export interface INotificationWindow extends IWindow {}

export interface NotificationWindowOptions extends WindowOptions {}

export class NotificationWindow extends Window implements INotificationWindow {
  #options: NotificationWindowOptions = {};

  constructor(
    title: string,
    body: string | Node,
    passedOptions: NotificationWindowOptions = {}
  ) {
    const options = {
      autofocus: true,
      canClose: true,
      canMaximise: false,
      classes: 'notificationWindow',
      ...passedOptions,
    };

    super(title, body, options);

    this.#options = options;
  }

  bindClose(): void {
    this.on('keydown', (event) => {
      // Closing this can open the next notice straight away, and a key left to the browser would close that one too,
      //  leaving a window that isn't drawn but has the keys (#351). Escape is the browser's whether or not this can
      //  close: one that can't would be closed by it, and only shown again.
      if (event.key === 'Escape') {
        event.preventDefault();
      }

      if (['Enter', 'Escape'].includes(event.key) && this.#options.canClose) {
        event.preventDefault();

        this.close();

        event.stopPropagation();
      }
    });
  }

  display(focus = true): Promise<void> {
    super.display();

    if (focus) {
      this.element().focus();
    }

    return Promise.resolve();
  }
}

export default NotificationWindow;
