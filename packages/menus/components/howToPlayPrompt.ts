// The title screen's "New to the game? How to play" (#1270): offered until the help is opened or the line dismissed, and
//  then not again, as this browser remembers. Where the browser keeps nothing (a private window, storage blocked), it's
//  offered each visit, and dismissed for that one.

import HowToPlay from './HowToPlay';
import { h } from '@civ-clone/ui-widgets/lib/html';
import { s } from '@dom111/element';
import { t } from 'i18next';

const storageKey = 'civ.howToPlay.seen';

/** Whether the prompt has been answered in this browser. */
export const howToPlaySeen = (): boolean => {
  try {
    return window.localStorage.getItem(storageKey) !== null;
  } catch {
    return false;
  }
};

/** Remembers the prompt answered, where the browser lets it. */
export const markHowToPlaySeen = (): void => {
  try {
    window.localStorage.setItem(storageKey, '1');
  } catch {
    // Not kept: offered again next visit.
  }
};

/** The prompt, or `null` once it's been answered. */
export const howToPlayPrompt = (): HTMLElement | null => {
  if (howToPlaySeen()) {
    return null;
  }

  const element = s('<p class="how-to-play-prompt"></p>'),
    question = document.createElement('span'),
    answered = (): void => {
      markHowToPlaySeen();
      element.remove();
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
        '<button type="button" class="btn-bare how-to-play-prompt-dismiss">×</button>'
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
