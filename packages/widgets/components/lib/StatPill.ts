import { s } from '@dom111/element';

export type StatPillTone = 'positive' | 'negative' | null;

export interface StatPillOptions {
  className: string;
  // Said for a screen reader before the value, and its tooltip unless the pill has a breakdown (`tooltip()`).
  label: string;
  value: string;
  // After the value, muted (`+2 / turn`), and coloured by `tone`.
  detail?: string;
  tone?: StatPillTone;
  // Before the value: an icon, a bar.
  before?: Node[];
  // A pill that opens something is a button that does this.
  onClick?: (() => void) | null;
}

/**
 * One figure as a pill (#698, #742): an icon, the value in bold, then a muted detail, drawn by `_stat-pill.scss` from
 *  the theme. A detail that's good or bad news takes the theme's positive or negative colour. Everything in it is set
 *  as text, not markup: they're translations and names.
 */
export const statPill = ({
  className,
  label,
  value,
  detail = '',
  tone = null,
  before = [],
  onClick = null,
}: StatPillOptions): HTMLElement => {
  const inner =
      '<span class="visually-hidden"></span><span class="yield-amount"><span class="value"></span></span><span class="detail"></span>',
    element = onClick
      ? s<HTMLButtonElement>(
          `<button type="button" class="btn-bare stat-pill ${className}">${inner}</button>`
        )
      : s(`<div class="stat-pill ${className}">${inner}</div>`);

  element.title = label;
  element.querySelector('.visually-hidden')!.textContent = `${label}: `;
  element.querySelector('.value')!.textContent = value;
  element.querySelector('.detail')!.textContent = detail;
  element.querySelector('.yield-amount')!.prepend(...before);

  if (tone !== null) {
    element.classList.add(tone);
  }

  if (onClick) {
    element.addEventListener('click', onClick);
  }

  return element;
};

export default statPill;
