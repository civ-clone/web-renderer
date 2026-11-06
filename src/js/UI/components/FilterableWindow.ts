import Window, { WindowOptions } from './Window';
import RowFilter, { filteredOutClass } from '../lib/filterRows';
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
  #groupSelector: string | null;
  #input: HTMLInputElement;
  #observer: MutationObserver | null = null;
  #rowSelector: string;

  constructor(
    title: string,
    body: string | Node,
    { groupSelector, rowSelector, ...options }: FilterableWindowOptions
  ) {
    // Shown here rather than by `Window`, once the box exists for `display()` to put in.
    super(title, body, { ...options, autoDisplay: false });

    this.#filter = new RowFilter(rowSelector, groupSelector ?? null);
    this.#groupSelector = groupSelector ?? null;
    this.#rowSelector = rowSelector;
    this.#input = document.createElement('input');

    Object.entries({
      'aria-label': t('Window.filter'),
      autocomplete: 'off',
      // The shortcut, where it's seen; a screen reader hears just "Filter".
      placeholder: t('Window.filter-placeholder'),
      spellcheck: 'false',
      type: 'search',
    }).forEach(([name, value]) => this.#input.setAttribute(name, value));

    h(this.#input, {
      input: () => this.refilter(),
      keydown: (event: KeyboardEvent) => {
        if (event.key !== 'ArrowDown' && event.key !== 'Enter') {
          return;
        }

        if (event.key === 'Enter' && this.entered()) {
          event.preventDefault();
          // Not on to the game, where Enter ends the turn.
          event.stopPropagation();

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
      if (event.key === 'Escape' && this.escaped()) {
        event.preventDefault();
        event.stopImmediatePropagation();

        return;
      }

      if (event.key === 'Escape' && this.#input.value !== '') {
        // Only the filter, wherever the focus is: the window stays open, and so does the dialog (#351).
        event.preventDefault();
        event.stopImmediatePropagation();

        this.#input.value = '';
        this.refilter();

        return;
      }

      // With nothing to filter, there's no box to type in.
      if (
        this.#bar.hidden ||
        event.target === this.#input ||
        takesText(event.target)
      ) {
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
    this.#watchRows();
  }

  close() {
    this.#observer?.disconnect();
    this.#observer = null;

    return super.close();
  }

  // Rows that change in place, a figure arriving or a city's reasons opening, are read again, so a filter matches what
  //  the player can see now (#664), and rows that arrive late show the box. Not for the filter's own hiding of them.
  #watchRows(): void {
    const body = this.element().querySelector(':scope > .body');

    if (
      this.#observer !== null ||
      body === null ||
      typeof MutationObserver !== 'function'
    ) {
      return;
    }

    const row = this.#rowSelector,
      own = [row, this.#groupSelector]
        .filter((selector) => selector !== null)
        .join(', '),
      isOrHolds = (node: Node): boolean =>
        node instanceof Element &&
        (node.matches(row) || node.querySelector(row) !== null),
      changesRows = ({ addedNodes, target, type }: MutationRecord): boolean => {
        const element =
          target instanceof Element ? target : target.parentElement;

        // Rows arriving, or something changing inside one; not the filter marking the rows themselves.
        return (
          (type === 'childList' && [...addedNodes].some(isOrHolds)) ||
          (element?.closest(row) != null &&
            !(type === 'attributes' && element.matches(own)))
        );
      };

    // Counted for the rows going: gone, one no longer matches a selector such as `tbody tr`.
    let rows = body.querySelectorAll(row).length;

    this.#observer = new MutationObserver((records): void => {
      const count = body.querySelectorAll(row).length,
        rowsWent = count !== rows;

      rows = count;

      if (rowsWent || records.some(changesRows)) {
        this.reread();

        // What refiltering itself changed, as a window's details beside its list do, isn't news: heard, it would
        //  refilter for ever.
        this.#observer?.takeRecords();
      }
    });

    this.#observer.observe(body, {
      attributeFilter: ['class', 'hidden'],
      characterData: true,
      childList: true,
      subtree: true,
    });
  }

  /** Escape, before the filter's or the window's: whether something in the window took it. */
  protected escaped(): boolean {
    return false;
  }

  /** Enter in the filter box, for a window that acts on it: `true` if it did, or the focus moves to the first row. */
  protected entered(): boolean {
    return false;
  }

  /** What's in the filter box. */
  protected filterText(): string {
    return this.#input.value;
  }

  /** Puts the focus in the filter box. */
  focusFilter(): void {
    this.#input.focus();
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

  /** Reads the rows' text afresh and filters them again, as after rows are redrawn in place. */
  reread(): void {
    // Shown first, so each is read as it's laid out: a hidden row's `innerText` is its `textContent`, with nothing
    //  between its cells, and a query across two of them would stop finding it. All are read before any is hidden
    //  again, so nothing is drawn in between.
    this.element()
      .querySelectorAll(`:scope > .body .${filteredOutClass}`)
      .forEach((row) => row.classList.remove(filteredOutClass));

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
    // Nothing to filter: no rows yet, or none at all.
    this.#bar.hidden =
      this.#input.value === '' &&
      body.querySelector(this.#rowSelector) === null;
    this.element().dispatchEvent(new CustomEvent('filtered'));
  }
}

export default FilterableWindow;
