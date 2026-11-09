import i18next, { t } from 'i18next';
import { s } from '@dom111/element';

// Said in English when the game fails before its text has loaded.
const FALLBACK = {
  body: 'The game could not start. Reload the page to try again.',
  reload: 'Reload',
};

// An error's message, for saying: anything thrown, `Error` or not.
const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Tells the player the game could not start (#850). A failure while starting used to be logged and nothing more, which
 *  left a blank page. It is a `<dialog>`, shown as a modal where the browser can, so it is over whatever was drawn
 *  before the failure. The error goes in as text: it can hold text from a save file.
 */
export const showStartFailure = (
  error: unknown,
  parent: HTMLElement = document.body,
  reload: () => void = (): void => window.location.reload()
): HTMLDialogElement => {
  const dialog = document.createElement('dialog'),
    what = document.createElement('p'),
    again = s<HTMLButtonElement>(
      '<button type="button" class="btn-primary"></button>'
    ),
    detail = describe(error),
    // In the game's words once it has them. Its text may not have loaded even then (it is fetched after i18next
    //  starts), so the English stands in for a missing string rather than its key.
    say = (key: keyof typeof FALLBACK): string =>
      i18next.isInitialized
        ? t(`StartFailure.${key}`, { defaultValue: FALLBACK[key] })
        : FALLBACK[key];

  dialog.className = 'start-failure';
  dialog.setAttribute('role', 'alertdialog');

  what.textContent = say('body');
  dialog.setAttribute('aria-label', what.textContent);
  dialog.append(what);

  if (detail) {
    const why = document.createElement('p');

    why.textContent = detail;
    dialog.append(why);
  }

  again.textContent = say('reload');
  again.addEventListener('click', (): void => reload());
  dialog.append(again);

  parent.append(dialog);

  try {
    dialog.showModal();
  } catch {
    // No modal to be had (an older browser, or a dialog already open in a way that forbids it): shown where it is.
    dialog.setAttribute('open', '');
  }

  return dialog;
};

export default showStartFailure;
