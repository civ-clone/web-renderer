import NotificationWindow from '@civ-clone/ui-component-window/NotificationWindow';
import { heldNoticeData } from '@civ-clone/ui-client/components/lib/cityBuild';
import { t } from 'i18next';

// TODO: add in key specifically
export interface Notification {
  bubble?: boolean;
  data: any;
  key: string;
}

export class Notifications {
  #container: HTMLElement;
  #notifications: Notification[] = [];
  #interval: number | null = null;
  #shown: ((notification: Notification) => void) | null = null;

  constructor(container: HTMLElement = document.body) {
    this.#container = container;
  }

  /** Told of each notification as its window opens, rather than as it's queued: the game's music (#126). */
  onShown(listener: ((notification: Notification) => void) | null): void {
    this.#shown = listener;
  }

  receive(notification: Notification): void {
    this.#notifications.push(notification);

    this.periodicChecker();
  }

  private check(): void {
    // Not the copy a closing window leaves to fade out (`Window`, #738), which has its classes: taken for the window,
    //  it held every notification after the first until the next one arrived.
    const active = document.querySelector(
      '.notificationWindow:not(.ui-window-ghost)'
    );

    // Stop polling when there is no work left.
    if (!this.#notifications.length) {
      this.periodicChecker(true);

      return;
    }

    // Still polled while one is open: any window of the kind (an action or a confirmation) holds the next notification,
    //  and only the ones this opens say when they close.
    if (active) {
      return;
    }

    const notification = this.#notifications.shift() as Notification;

    this.publish(notification);
  }

  private periodicChecker(remove: boolean = false): void {
    if (remove) {
      if (this.#interval === null) {
        return;
      }

      window.clearInterval(this.#interval);

      this.#interval = null;

      return;
    }

    if (this.#interval !== null) {
      return;
    }

    this.#interval = window.setInterval(() => this.check(), 500);

    // Flush immediately so the first notification is not delayed by polling.
    this.check();
  }

  private publish(notification: Notification): void {
    const message = t(`${notification.key}.body`, {
        ...notification.data,
        ...heldNoticeData(notification),
        ns: 'notification',
        skipOnVariables: false,
      }) as unknown as string,
      title = t(`${notification.key}.title`, {
        ...notification.data,
        ...heldNoticeData(notification),
        defaultValue: t('Notification.title'),
        ns: 'notification',
        skipOnVariables: false,
      }) as unknown as string,
      notificationWindow = new NotificationWindow(title, message, {
        modal: true,
        parent: this.#container,
      });

    // The next one at once, rather than at the next poll, which goes on while any are waiting.
    notificationWindow.on('close', () => this.check());

    this.#shown?.(notification);
  }
}

export default Notifications;
