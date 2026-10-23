import Transport from '../Transport';
import { TransportTranslatedNotice } from '../../Engine/Transport';
import { t } from 'i18next';

// The line along the top of the page that shows a message for 4 seconds: the worker's `notification` messages, the
//  cheats notice from the game's `keydown` handler, and the `?debug=1` panel's notices. A new message replaces the
//  one showing and restarts the timer. Set as text: a loaded save's name and errors reach it, and none of it is
//  markup (#469). A message sent as a key is translated first (#588).
export class NotificationBar {
  #notificationArea: HTMLElement;
  #timer: number | undefined;

  constructor(notificationArea: HTMLElement) {
    this.#notificationArea = notificationArea;
  }

  show(data: string): void {
    this.#notificationArea.textContent = data;

    if (this.#timer) {
      window.clearTimeout(this.#timer);
    }

    this.#timer = window.setTimeout((): void => {
      this.#timer = undefined;

      this.#notificationArea.textContent = '';
    }, 4000);
  }

  // Returns the disposer for `Renderer`'s `transportDisposers`.
  listen(transport: Transport): () => void {
    return transport.receive(
      'notification',
      (data: string | TransportTranslatedNotice): void =>
        this.show(
          typeof data === 'string'
            ? data
            : String(t(data.key, { ...data.data, skipOnVariables: false }))
        )
    );
  }
}

export default NotificationBar;
