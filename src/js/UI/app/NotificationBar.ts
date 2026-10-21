import Transport from '../Transport';

// The line along the top of the page that shows a message for 4 seconds: the worker's `notification` messages, and
//  the cheats notice from the game's `keydown` handler. A new message replaces the one showing and restarts the
//  timer. Set as HTML (#469).
export class NotificationBar {
  #notificationArea: HTMLElement;
  #timer: number | undefined;

  constructor(notificationArea: HTMLElement) {
    this.#notificationArea = notificationArea;
  }

  show(data: string): void {
    this.#notificationArea.innerHTML = data;

    if (this.#timer) {
      window.clearTimeout(this.#timer);
    }

    this.#timer = window.setTimeout((): void => {
      this.#timer = undefined;

      this.#notificationArea.innerText = '';
    }, 4000);
  }

  // Returns the disposer for `Renderer`'s `transportDisposers`.
  listen(transport: Transport): () => void {
    return transport.receive('notification', (data: string): void =>
      this.show(data)
    );
  }
}

export default NotificationBar;
