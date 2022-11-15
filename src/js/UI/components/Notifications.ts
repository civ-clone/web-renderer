import NotificationWindow from './NotificationWindow';

export interface Notification {
  message: string;
  title?: string;
}

export class Notifications {
  #container: HTMLElement;
  #notifications: Notification[] = [];

  constructor(container: HTMLElement = document.body) {
    this.#container = container;
  }

  receive(notification: Notification): void {
    this.#notifications.push(notification);

    this.check();
  }

  private check(): void {
    const active = document.querySelector('.notificationWindow');

    if (!this.#notifications.length || active) {
      return;
    }

    const notification = this.#notifications.shift() as Notification;

    this.publish(notification);
  }

  private publish(notification: Notification): void {
    const notificationWindow = new NotificationWindow(
      notification.title ?? 'Notification',
      notification.message,
      {
        parent: this.#container,
      }
    );

    notificationWindow.element().addEventListener('close', () => this.check());
  }
}

export default Notifications;
