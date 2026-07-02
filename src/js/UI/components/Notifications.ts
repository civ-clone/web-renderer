import NotificationWindow from './NotificationWindow';
import { t } from 'i18next';

// TODO: add in key specifically
export interface Notification {
  data: any;
  key: string;
}

export class Notifications {
  #container: HTMLElement;
  #notifications: Notification[] = [];
  #interval: number | null = null;

  constructor(container: HTMLElement = document.body) {
    this.#container = container;
  }

  receive(notification: Notification): void {
    this.#notifications.push(notification);

    this.periodicChecker();
  }

  private check(): void {
    const active = document.querySelector('.notificationWindow');

    if (!this.#notifications.length || active) {
      // Stop polling when there is no work left.
      this.periodicChecker(true);

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
        ns: 'notification',
        skipOnVariables: false,
      }) as unknown as string,
      title = t(`${notification.key}.title`, {
        ...notification.data,
        defaultValue: t('Notification.title'),
        ns: 'notification',
        skipOnVariables: false,
      }) as unknown as string,
      notificationWindow = new NotificationWindow(title, message, {
        modal: true,
        parent: this.#container,
      });

    notificationWindow.on('close', () => this.periodicChecker());
  }
}

export default Notifications;
