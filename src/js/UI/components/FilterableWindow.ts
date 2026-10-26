import Window, { WindowOptions } from './Window';
import RowFilter from '../lib/filterRows';
import { h } from '../lib/html';
import { s } from '@dom111/element';
import { t } from 'i18next';

export type FilterableWindowOptions = WindowOptions & {
  // Hidden, when none of their rows match: a list's sections, so no heading is left over a list with nothing in it.
  groupSelector?: string;
  // The rows to filter, inside the window's body.
  rowSelector: string;
};

// What the player types to narrow the list: one character, with no modifier that makes it a shortcut. Not Space, which
//  presses the button it's on.
const isTyping = (event: KeyboardEvent): boolean =>
  event.key.length === 1 &&
  event.key !== ' ' &&
  !event.ctrlKey &&
  !event.altKey &&
  !event.metaKey;

// What can take focus in a row, for moving from the box to the list.
const focusable = 'a[href], button, input, select, textarea, [tabindex]';

const takesText = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.matches('input, textarea, select') || target.isContentEditable);

/**
 * A window whose list can be narrowed by typing (#661): a filter box under the title bar, kept when the list is
 * redrawn, that hides the rows that don't match. `/`, or typing anywhere in the window, puts the text in the box,
 * Down or Enter in the box moves to the first row shown, and Escape clears the filter before it does anything else.
 */
export class FilterableWindow extends Window {
  #bar: HTMLElement;
  #empty: HTMLElement = s(
    `<p class="filter-empty" hidden>${t('Window.filter-empty')}</p>`
  );
  #filter: RowFilter;
  #input: HTMLInputElement;
  #rowSelector: string;

  constructor(
    title: string,
    body: string | Node,
    { groupSelector, rowSelector, ...options }: FilterableWindowOptions
  ) {
    // Shown here rather than by `Window`, once the box exists for `display()` to put in.
    super(title, body, { ...options, autoDisplay: false });

    this.#filter = new RowFilter(rowSelector, groupSelector ?? null);
    this.#rowSelector = rowSelector;
    this.#input = document.createElement('input');

    Object.entries({
      'aria-label': t('Window.filter'),
      autocomplete: 'off',
      placeholder: t('Window.filter'),
      spellcheck: 'false',
      type: 'search',
    }).forEach(([name, value]) => this.#input.setAttribute(name, value));

    h(this.#input, {
      input: () => this.refilter(),
      keydown: (event: KeyboardEvent) => {
        if (event.key !== 'ArrowDown' && event.key !== 'Enter') {
          return;
        }

        const row = this.element().querySelector(
            `:scope > .body ${this.#rowSelector}:not(.filtered-out)`
          ),
          target = row?.matches(focusable)
            ? row
            : row?.querySelector(focusable);

        if (target instanceof HTMLElement) {
          event.preventDefault();

          target.focus();
        }
      },
    });

    this.#bar = s(
      '<div class="window-filter"></div>',
      this.#input,
      this.#empty
    );

    // Heard before `Window`'s own keydown, which is added each time the window is shown.
    this.on('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape' && this.#input.value !== '') {
        // Only the filter, wherever the focus is: the window stays open, and so does the dialog (#351).
        event.preventDefault();
        event.stopImmediatePropagation();

        this.#input.value = '';
        this.refilter();

        return;
      }

      if (event.target === this.#input || takesText(event.target)) {
        return;
      }

      if (event.key === '/') {
        event.preventDefault();

        this.#input.focus();

        return;
      }

      if (!isTyping(event)) {
        return;
      }

      event.preventDefault();

      this.#input.value += event.key;
      this.#input.focus();
      this.refilter();
    });

    if (options.autoDisplay ?? true) {
      this.display();
    }
  }

  display(focus?: boolean): void {
    super.display(focus);

    this.element().querySelector(':scope > header')?.after(this.#bar);

    this.refilter();
  }

  /** What's in the filter box. */
  filter(): string {
    return this.#input.value;
  }

  update(content: string | Node): void {
    super.update(content);

    this.#filter.forget();
    this.refilter();
  }

  /** Filters the rows again, as after one is removed. */
  refilter(): void {
    const body = this.element().querySelector(':scope > .body');

    if (body === null) {
      return;
    }

    const shown = this.#filter.apply(body, this.#input.value);

    this.#empty.hidden = shown > 0 || this.#input.value.trim() === '';
  }
}

export default FilterableWindow;
