import { Window, IWindow, WindowOptions } from './Window';

export interface INotificationWindow extends IWindow {}

const notificationQueue: [
  NotificationWindow,
  boolean,
  (...args: any[]) => void
][] = [];

export interface NotificationWindowOptions extends WindowOptions {
  queue?: boolean;
}

export class NotificationWindow extends Window implements INotificationWindow {
  #options: NotificationWindowOptions = {};

  constructor(
    title: string,
    body: string | Node,
    passedOptions: NotificationWindowOptions = {}
  ) {
    const options = {
      queue: true,
      ...passedOptions,
    };

    super(title, body, options);

    this.#options = options;

    this.element().classList.add('notificationWindow');

    this.element().addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        this.close();

        event.stopPropagation();
      }
    });
  }

  close(): void {
    super.close();

    if (
      this.#options.queue &&
      notificationQueue.length &&
      NotificationWindow.hasOpenWindow()
    ) {
      const [notification, focus, resolve] = notificationQueue.shift()!;

      notification.display(focus);

      resolve();
    }
  }

  display(focus = true): Promise<any> {
    return new Promise((resolve) => {
      if (NotificationWindow.hasOpenWindow()) {
        notificationQueue.push([this, focus, resolve]);

        return;
      }

      super.display();

      if (!focus) {
        resolve(undefined);

        return;
      }

      this.element().focus();

      resolve(undefined);
    });
  }

  public static hasOpenWindow(): boolean {
    return !!document.querySelector('div.notificationWindow');
  }
}

export default NotificationWindow;
