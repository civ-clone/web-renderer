import { s } from '@dom111/element';

export interface ProgressBarOptions {
  // The yield it measures (`Food`, `Production`, `Research`, ...), which gives the fill its colour.
  group: string;
  stored: number;
  capacity: number;
  // What next turn adds (the striped part), or, below 0, what a shortfall takes away (the red part).
  perTurn: number;
  // Said for a screen reader, with the figures, when the bar is the only place they're shown. Without one the bar is
  //  decorative, as where the figures are said beside it.
  label?: string | null;
}

/**
 * How far something is towards its goal, as a bar (#686, #687, #742): the part already stored, then a striped part for
 *  what comes in next turn, or a red one for what a shortfall takes away. A tick marks every 10, as Civ1's food box
 *  has a column for each 10 (every 20 or more for a large cost, so they stay apart). Drawn by `_progress-bar.scss`
 *  from the theme's tokens.
 */
export const progressBar = ({
  group,
  stored,
  capacity,
  perTurn,
  label = null,
}: ProgressBarOptions): HTMLElement => {
  // None for a capacity that isn't a count (an item's cost is `Infinity` until one is chosen).
  capacity = Number.isFinite(capacity) ? Math.max(0, capacity) : 0;

  const bar = s(
    `<div class="progress-bar" data-yield="${group}"><span class="fill"></span><span class="next"></span></div>`
  );

  if (capacity === 0) {
    bar.hidden = true;
    bar.setAttribute('aria-hidden', 'true');

    return bar;
  }

  const clamp = (value: number, max: number) =>
      Number.isFinite(value) ? Math.max(0, Math.min(value, max)) : 0,
    percent = (value: number) => `${(value / capacity) * 100}%`,
    loss = perTurn < 0 ? clamp(-perTurn, clamp(stored, capacity)) : 0,
    done = clamp(stored, capacity) - loss,
    next = loss > 0 ? loss : clamp(perTurn, capacity - done),
    tick = 10 * Math.ceil(capacity / 300),
    [fill, coming] = Array.from(bar.children) as HTMLElement[];

  fill.style.width = percent(done);
  coming.style.width = percent(next);
  coming.classList.toggle('loss', loss > 0);

  bar.style.setProperty('--tick', percent(Math.min(tick, capacity)));

  if (label === null) {
    bar.setAttribute('aria-hidden', 'true');

    return bar;
  }

  // Set as attributes, not markup: a label is a translation with names in it.
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-label', label);
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', `${capacity}`);
  bar.setAttribute('aria-valuenow', `${clamp(stored, capacity)}`);

  return bar;
};

export default progressBar;
