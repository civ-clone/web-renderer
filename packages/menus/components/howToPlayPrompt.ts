// The title screen's "New to the game? How to play" (#1270): offered until the help is opened or the line dismissed, and
//  then not again, as this browser remembers. Where the browser keeps nothing (a private window, storage blocked), it's
//  offered each visit, and dismissed for that one.

import { howToPlaySeen, markHowToPlaySeen } from '../lib/howToPlaySeen';
import HowToPlay from './HowToPlay';
import { glyph } from '@civ-clone/ui-platform/lib/glyphs';
import { h } from '@civ-clone/ui-widgets/lib/html';
import { s } from '@dom111/element';
import { t } from 'i18next';

/** The prompt, or `null` once it's been answered. */
export const howToPlayPrompt = (): HTMLElement | null => {
  if (howToPlaySeen()) {
    return null;
  }

  const element = s('<p class="how-to-play-prompt"></p>'),
    question = document.createElement('span'),
    answered = (): void => {
      const host = element.parentElement,
        hadFocus = element.contains(document.activeElement);

      markHowToPlaySeen();
      element.remove();

      // The focus back on the menu it was in, for its keys: the button it was on is gone.
      if (hadFocus) {
        host?.querySelector<HTMLButtonElement>('button:not([hidden])')?.focus();
      }
    };

  question.textContent = t('HowToPlay.prompt.question');

  const openButton = h(
      s<HTMLButtonElement>(
        '<button type="button" class="btn-bare how-to-play-prompt-open"></button>'
      ),
      {
        click: (): void => {
          answered();
          HowToPlay.open();
        },
      }
    ),
    dismissButton = h(
      s<HTMLButtonElement>(
        `<button type="button" class="btn-bare how-to-play-prompt-dismiss">${glyph(
          'close'
        )}</button>`
      ),
      { click: answered }
    );

  openButton.textContent = t('HowToPlay.prompt.open');
  dismissButton.setAttribute('aria-label', t('HowToPlay.prompt.dismiss'));
  dismissButton.title = t('HowToPlay.prompt.dismiss');

  element.append(question, ' ', openButton, ' ', dismissButton);

  return element;
};

export default howToPlayPrompt;

export { howToPlaySeen, markHowToPlaySeen };
