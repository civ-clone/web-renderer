import NotificationWindow from '@civ-clone/ui-component-window/NotificationWindow';
import type Window from '@civ-clone/ui-component-window/Window';
import { heldNoticeData } from '@civ-clone/ui-client/components/lib/cityBuild';
import { t } from 'i18next';

// TODO: add in key specifically
export interface Notification {
  bubble?: boolean;
  data: any;
  key: string;
  // A window of its own rather than the key's title and body: the game's help (#1295), which waits its turn as the
  //  game's notices do. Not one of the game's notices, so not heard as one.
  open?: (container: HTMLElement) => Window;
}

// The windows the help waits behind, besides the notices: choices (classic's selections are action windows), questions,
//  and anything modal. Never the copy a closing one leaves to fade out.
const helpWaitsFor = [
  '.actionWindow',
  '.confirmationWindow',
  '.ui-choice-window',
  'dialog.window.modal[open]',
]
  .map((selector) => `${selector}:not(.ui-window-ghost)`)
  .join(', ');

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

    // The help waits for any choice or question too (#1295): it's never the thing to answer first.
    if (
      this.#notifications[0]?.open &&
      document.querySelector(helpWaitsFor) !== null
    ) {
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

  /** Drops those waiting that `predicate` matches: the help, turned off with some of it still to come. */
  discard(predicate: (notification: Notification) => boolean): void {
    this.#notifications = this.#notifications.filter(
      (notification) => !predicate(notification)
    );
  }

  private publish(notification: Notification): void {
    if (notification.open) {
      notification.open(this.#container).on('close', () => this.check());

      return;
    }

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
