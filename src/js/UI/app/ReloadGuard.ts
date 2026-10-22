import { off, on } from '@dom111/element';
import ConfirmationWindow from '../components/ConfirmationWindow';
import { allowLeaving } from '../lib/leaveGuard';
import { t } from 'i18next';

// F5 and Ctrl/Cmd+R ask before reloading. Once a game is running, F5 is a
// leader-screen shortcut (TradeReport), not a reload; only Ctrl/Cmd+R stays a
// reload from that point on, so `isGameStarted` is read on every key press.
//
// Registered on `document` in the bubble phase before the game's `keydown`
// handler, and that order matters: this must stay the first bubble listener.
export class ReloadGuard {
  #isGameStarted: () => boolean;
  #listener = (event: KeyboardEvent): void => {
    if (
      (event.key === 'F5' && !this.#isGameStarted()) ||
      (['R', 'r'].includes(event.key) &&
        (/Mac OS X/.test(navigator.userAgent) ? event.metaKey : event.ctrlKey))
    ) {
      event.preventDefault();

      new ConfirmationWindow(
        t('ReloadGuard.title'),
        t('ReloadGuard.body'),
        () => {
          allowLeaving();

          window.location.reload();
        }
      );

      return;
    }
  };

  constructor(isGameStarted: () => boolean) {
    this.#isGameStarted = isGameStarted;

    on(document, 'keydown', this.#listener);
  }

  // Not called yet: the listener has always lasted as long as the page.
  dispose(): void {
    off(document, 'keydown', this.#listener);
  }
}

export default ReloadGuard;
