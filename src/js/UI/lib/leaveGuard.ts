import { t } from 'i18next';

/**
 * Stops Back, or closing the tab, from silently ending a game in progress.
 *
 * Back is caught with a history entry of our own: pressing it lands on the entry beneath, which we answer by putting
 *  ours back and asking. Anything else that leaves the page gets the browser's own prompt, which is all a page is
 *  allowed.
 *
 * The page's own reloads — the reload shortcut, loading a save — have already asked, so they call `allowLeaving()`
 *  first rather than asking twice.
 *
 * `ConfirmationWindow` is imported only when it is needed: it builds DOM at import, and `savedGame` — which the node
 *  tests load — imports this module.
 */
let guarding = false,
  leaving = false,
  asking = false;

const pushGuardEntry = (): void =>
    history.pushState({ leaveGuard: true }, '', location.href),
  popStateHandler = (): void => {
    if (!guarding || leaving) {
      return;
    }

    pushGuardEntry();

    // Pressing Back again while we are asking would otherwise stack another prompt.
    if (asking) {
      return;
    }

    asking = true;

    import('../components/ConfirmationWindow').then(
      ({ ConfirmationWindow }) => {
        const confirmation = new ConfirmationWindow(
          t('LeaveGuard.title'),
          t('LeaveGuard.body'),
          () => {
            allowLeaving();

            // Past our entry and the one beneath it, to wherever Back was going.
            history.go(-2);
          }
        );

        confirmation.on('close', () => {
          asking = false;
        });
      }
    );
  },
  beforeUnloadHandler = (event: BeforeUnloadEvent): void => {
    if (!guarding || leaving) {
      return;
    }

    event.preventDefault();
    event.returnValue = '';
  };

export const guardLeaving = (): void => {
  if (guarding) {
    return;
  }

  guarding = true;

  pushGuardEntry();

  window.addEventListener('popstate', popStateHandler);
  window.addEventListener('beforeunload', beforeUnloadHandler);
};

export const allowLeaving = (): void => {
  leaving = true;
};

export default guardLeaving;
