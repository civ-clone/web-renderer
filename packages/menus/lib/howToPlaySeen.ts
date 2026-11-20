// Whether How to play has been seen (#1270), as this browser remembers: the title screen's first-visit line is offered
//  until it has, by the line or by opening the help any other way. Where the browser keeps nothing (a private window,
//  storage blocked), it's never remembered.

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
