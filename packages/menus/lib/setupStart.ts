// Start, as both interfaces' setup presses it (#954): a rule set switched a moment ago may still be on its way, and the
//  start waits for it. Meanwhile the setup can't be changed (its body is `inert`), and Start is held. Closing the
//  setup meanwhile calls the start off. A start that doesn't go ahead (a problem the change left, or a change that
//  failed) leaves the setup as it was, to show why.

import GameSetup from '@civ-clone/ui-client/lib/gameSetup';
import Window from '@civ-clone/ui-component-window/Window';

/** Calls the start off if `window` closes while it waits: once it has gone ahead, closing the window is its own doing. */
export const cancelStartOnClose = (window: Window, setup: GameSetup): void =>
  window.on('close', () => setup.cancelStart());

/**
 * Holds `window`'s setup while `begin` waits, and lets it go if the start doesn't go ahead. `begin` is given what closes
 *  the window once the start is going ahead.
 */
export const startFromSetup = async (
  window: Window,
  setup: GameSetup,
  start: HTMLButtonElement,
  begin: (goingAhead: () => void) => Promise<boolean>
): Promise<void> => {
  const element = window.element(),
    body = element.querySelector<HTMLElement>(':scope > .body') ?? element;

  start.disabled = true;
  body.setAttribute('inert', '');

  // The keyboard can't stay on what can't be used, Start included, which may be in the window's footer: it goes to the
  //  first other button outside the body (the title bar's close button, in either interface's frame), or the window
  //  itself, so that Escape still closes it.
  if (
    document.activeElement === start ||
    body.contains(document.activeElement)
  ) {
    (
      [...element.querySelectorAll<HTMLElement>('button')].find(
        (button) => button !== start && !body.contains(button)
      ) ?? element
    ).focus();
  }

  if (await begin(() => window.close())) {
    return;
  }

  body.removeAttribute('inert');
  start.disabled = setup.ruleSetsBlockStart();
};

export default startFromSetup;
