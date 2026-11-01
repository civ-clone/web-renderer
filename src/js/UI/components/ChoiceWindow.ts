import { ActionWindowActions } from './ActionWindow';
import FilterableWindow from './FilterableWindow';
import { GlyphName, glyph } from '../lib/glyphs';
import { button } from '../lib/button';
import { filteredOutClass } from '../lib/filterRows';
import { h } from '../lib/html';
import { mappedKeyFromEvent } from '../lib/mappedKey';
import { s } from '@dom111/element';
import { singleChoice } from '../lib/singleChoice';
import { t } from 'i18next';

/** One figure on a row, on its right: an icon or glyph, then the value. `label` is said for a screen reader. */
export interface ChoiceFact {
  glyph?: GlyphName;
  label: string;
  value: string;
}

/** One thing to choose (#745), filled by each list from what the engine sent with it (#274). */
export interface ChoiceRow {
  // What `onChoose` is given: unique in the list.
  value: string;
  // The name, already translated, set as text.
  label: string;
  // A heading, already translated: rows next to each other with the same `group` are listed under it.
  group?: string;
  // Drawn as the row is made: a unit's sprite, a civilization's colours. `null`, or a throw, draws none.
  sprite?: () => Node | null;
  // A line under the name, muted.
  meta?: string | null;
  facts?: ChoiceFact[];
  // What the primary button says while this row is chosen ("Build Settlers"); by default "Choose".
  primary?: string;
}

/** What the pane beside the list shows for a row, or `null` for an empty pane. It may take a moment. */
export type ChoiceDescriber = (
  row: ChoiceRow
) => Node | null | Promise<Node | null>;

export interface ChoiceWindowOptions {
  // The window's classes, for its eyebrow and its styles.
  classes?: string[];
  // A list with one row is chosen without being shown (#148). `false` is for a list whose one row is still a decision.
  autoChooseSingle?: boolean;
  // Whether the list can be left with nothing chosen: Escape and Cancel close it, leaving things as they were.
  canClose?: boolean;
  // The row chosen as the window opens: what's being built, or what the engine suggests. By default the first.
  chosen?: string | null;
  // Over the list: why it has opened.
  intro?: Node | null;
  describe?: ChoiceDescriber | null;
  // Buttons beside the primary (Auto, Can't build…), given the window.
  actions?: ActionWindowActions;
}

let lists = 0;

/**
 * Every "pick one from a list" under the new interface (#745): rows with a sprite, the name and a line under it, and
 *  the facts that decide it on the right, under group headings; a pane beside them describing the row chosen; and a
 *  footer whose primary names the choice. The arrows move through the rows, typing filters them (#661), Enter or a
 *  double-click chooses, and Escape leaves things as they were where the list can be closed. Only the list scrolls,
 *  the footer stays in view (#634).
 */
export class ChoiceWindow extends FilterableWindow {
  #autoChosen: boolean = false;
  #chosen: HTMLElement | null = null;
  // The row the player chose last, given back when a filter that hid it is cleared.
  #wanted: HTMLElement | null = null;
  #describe: ChoiceDescriber | null;
  #done: boolean = false;
  #details: HTMLElement;
  // The row the pane was last asked about, so an answer that comes late for another row is dropped.
  #describing: ChoiceRow | null = null;
  #list: HTMLElement;
  #onChoose: (value: string) => void;
  #primary: HTMLButtonElement;
  #rows = new Map<HTMLElement, ChoiceRow>();

  constructor(
    title: string,
    rows: ChoiceRow[],
    onChoose: (value: string) => void,
    {
      classes = [],
      autoChooseSingle = true,
      canClose = true,
      chosen = null,
      intro = null,
      describe = null,
      actions = {},
    }: ChoiceWindowOptions = {}
  ) {
    const autoChoice = singleChoice(rows, autoChooseSingle),
      id = `ui-choice-${++lists}`,
      list = s('<div class="ui-choice-list" role="listbox"></div>'),
      details = s(
        '<aside class="ui-choice-details" aria-live="polite"></aside>'
      ),
      primary = button(t('ChoiceWindow.choose'), { variant: 'primary' }),
      footer = s(
        '<footer></footer>',
        ...(canClose
          ? [
              h(
                button(t('Generic.cancel'), {
                  variant: 'quiet',
                  hotkey: 'Escape',
                }),
                { click: () => this.close() }
              ),
            ]
          : []),
        ...Object.values(actions).map(({ label, action, variant }) =>
          h(button(label, { variant: variant ?? 'secondary' }), {
            click: () => action(this),
          })
        ),
        primary
      );

    super(
      title,
      s(
        '<div class="ui-choice"></div>',
        ...(intro === null ? [] : [intro]),
        s('<div class="ui-choice-panes"></div>', list, details),
        footer
      ),
      {
        // Shown once its rows are in, below.
        autoDisplay: false,
        canClose,
        classes: ['ui-choice-window', ...classes],
        groupSelector: '.ui-choice-group',
        rowSelector: '.ui-choice-row',
      }
    );

    list.setAttribute('aria-label', title);

    this.#describe = describe;
    this.#details = details;
    this.#list = list;
    this.#onChoose = onChoose;
    this.#primary = primary;

    if (autoChoice !== null) {
      this.#autoChosen = true;

      // Not from inside the constructor: `onChoose` usually closes what the caller is still making.
      queueMicrotask(() => this.#choose(autoChoice.value));

      return;
    }

    rows.forEach((row, index) => {
      const element = this.#row(row, `${id}-${index}`);

      if (row.group === undefined) {
        list.append(element);

        return;
      }

      if (rows[index - 1]?.group !== row.group) {
        const heading = s(
          `<p class="ui-choice-heading" id="${id}-group-${index}"></p>`
        );

        heading.textContent = row.group;

        list.append(
          s(
            `<div class="ui-choice-group" role="group" aria-labelledby="${id}-group-${index}"></div>`,
            heading
          )
        );
      }

      list.lastElementChild!.append(element);
    });

    h(primary, {
      click: () => {
        const row = this.#chosen && this.#rows.get(this.#chosen);

        if (row) {
          this.#choose(row.value);
        }
      },
    });

    h(list, {
      // A row that takes the focus is the one chosen, however it got it: the filter box's Down or Enter, Tab, a click.
      //  Otherwise the focus ring and the choice Enter takes could be on two different rows.
      focusin: (event: FocusEvent) => {
        const row = (event.target as Element | null)?.closest?.(
          '.ui-choice-row'
        );

        if (row instanceof HTMLElement && this.#rows.has(row)) {
          this.#select(row);
        }
      },
      keydown: (event: KeyboardEvent) => this.#key(event),
    });

    this.#select(
      this.#elements().find(
        (element) => this.#rows.get(element)!.value === chosen
      ) ??
        this.#shown()[0] ??
        null
    );

    this.on('focus', () => this.#chosen?.focus());

    this.display();
  }

  autoChosen(): boolean {
    return this.#autoChosen;
  }

  /** The value of the row chosen now, or `null` when none is. */
  chosen(): string | null {
    return this.#chosen ? this.#rows.get(this.#chosen)!.value : null;
  }

  close(): void {
    // Never shown, so there's nothing to take down, nor focus to give back.
    if (this.#autoChosen) {
      this.emit(new CustomEvent('close'));

      return;
    }

    super.close();
  }

  display(focus?: boolean): void {
    super.display(focus);

    // Shown again after `close()`, say: there's a row to put the focus on. Never before the rows are in.
    if (!(#rows in this)) {
      return;
    }

    this.#chosen?.focus();
    this.#scrollTo(this.#chosen);
  }

  refilter(): void {
    super.refilter();

    if (!(#rows in this)) {
      return;
    }

    const shown = this.#shown();

    // The chosen row filtered out: the first one shown instead, so Enter never chooses what can't be seen. The one the
    //  player chose comes back once it's shown again.
    if (this.#wanted !== null && shown.includes(this.#wanted)) {
      this.#select(this.#wanted, false);
    } else if (this.#chosen === null || !shown.includes(this.#chosen)) {
      this.#select(shown[0] ?? null, false);
    }
  }

  /** The list's rows, in order. */
  rows(): HTMLElement[] {
    return this.#elements();
  }

  #choose(value: string): void {
    // Once: a double-click's second click, or Enter heard by both chromes, would choose again.
    if (this.#done) {
      return;
    }

    this.#done = true;

    this.emit(new CustomEvent<string>('selection', { detail: value }));

    this.close();

    this.#onChoose(value);
  }

  #elements(): HTMLElement[] {
    return Array.from(this.#rows.keys());
  }

  #key(event: KeyboardEvent): void {
    const key = mappedKeyFromEvent(event),
      shown = this.#shown(),
      index = this.#chosen === null ? -1 : shown.indexOf(this.#chosen),
      // A page is as many rows as the list shows.
      page = Math.max(
        1,
        Math.floor(
          this.#list.clientHeight / (this.#chosen?.offsetHeight || 1)
        ) - 1
      ),
      target: { [key: string]: number } = {
        ArrowDown: index + 1,
        ArrowUp: index - 1,
        End: shown.length - 1,
        Home: 0,
        PageDown: index + page,
        PageUp: index - page,
      };

    if (key === 'Enter') {
      // The new chrome presses the primary on the way in; this is the classic chrome's.
      event.preventDefault();

      this.#primary.click();

      return;
    }

    if (!(key in target)) {
      return;
    }

    event.preventDefault();

    const row =
      shown[Math.min(shown.length - 1, Math.max(0, target[key]))] ?? null;

    this.#select(row);
    row?.focus();
  }

  #row(row: ChoiceRow, id: string): HTMLElement {
    const element = s(
        `<div class="ui-choice-row" role="option" id="${id}" tabindex="-1" aria-selected="false"></div>`
      ),
      sprite = s('<span class="ui-choice-sprite" aria-hidden="true"></span>'),
      name = s('<span class="ui-choice-name"></span>'),
      text = s('<span class="ui-choice-text"></span>', name),
      facts = s('<span class="ui-choice-facts"></span>');

    name.textContent = row.label;

    try {
      const drawn = row.sprite?.() ?? null;

      if (drawn !== null) {
        sprite.append(drawn);
      }
    } catch {
      // No sprite rather than no row: one the tileset can't draw.
    }

    if (row.meta) {
      const meta = s('<span class="ui-choice-meta"></span>');

      meta.textContent = row.meta;
      text.append(meta);
    }

    (row.facts ?? []).forEach((fact) => {
      const element = s(
          `<span class="ui-choice-fact">${
            fact.glyph ? glyph(fact.glyph) : ''
          }<span class="visually-hidden"></span><span class="ui-choice-fact-value"></span></span>`
        ),
        value = element.querySelector('.ui-choice-fact-value')!;

      element.title = fact.label;
      element.querySelector(
        '.visually-hidden'
      )!.textContent = `${fact.label}: `;
      value.textContent = fact.value;
      facts.append(element);
    });

    element.append(sprite, text, facts);

    h(element, {
      click: () => this.#select(element),
      dblclick: () => this.#choose(row.value),
    });

    this.#rows.set(element, row);

    return element;
  }

  // `remember` is false where the list, not the player, moves the choice.
  #select(element: HTMLElement | null, remember: boolean = true): void {
    const previous = this.#chosen;

    this.#chosen = element;

    if (remember) {
      this.#wanted = element;
    }

    if (previous !== element) {
      previous?.setAttribute('aria-selected', 'false');
      previous?.setAttribute('tabindex', '-1');
    }

    const row = element ? this.#rows.get(element)! : null;

    element?.setAttribute('aria-selected', 'true');
    // The one row Tab stops on.
    element?.setAttribute('tabindex', '0');
    this.#scrollTo(element);

    this.#primary.textContent = row?.primary ?? t('ChoiceWindow.choose');
    this.#primary.disabled = row === null;

    if (previous !== element || this.#describing === null) {
      this.#showDetails(row);
    }
  }

  // The list scrolled to show `element`, and only the list: `scrollIntoView` would scroll the window's body too, taking
  //  the pane beside the list with it.
  #scrollTo(element: HTMLElement | null): void {
    if (element === null) {
      return;
    }

    // A group's first row brings its heading with it.
    const shown = element.previousElementSibling?.matches('.ui-choice-heading')
        ? element.previousElementSibling
        : element,
      list = this.#list.getBoundingClientRect(),
      row = shown.getBoundingClientRect(),
      bottom = element.getBoundingClientRect().bottom;

    if (row.top < list.top) {
      this.#list.scrollTop -= list.top - row.top;
    } else if (bottom > list.bottom) {
      this.#list.scrollTop += bottom - list.bottom;
    }
  }

  #shown(): HTMLElement[] {
    return this.#elements().filter(
      (element) => !element.classList.contains(filteredOutClass)
    );
  }

  #showDetails(row: ChoiceRow | null): void {
    this.#describing = row;

    if (row === null || this.#describe === null) {
      this.#details.replaceChildren();
      this.#details.hidden = this.#describe === null;

      return;
    }

    // A describer that throws is a failure like one that rejects: an empty pane, not a window half made.
    new Promise<Node | null>((resolve) => resolve(this.#describe!(row))).then(
      (details) => {
        if (this.#describing === row) {
          this.#details.replaceChildren(...(details ? [details] : []));
        }
      },
      // Not answered: an empty pane, not a broken one.
      () => {
        if (this.#describing === row) {
          this.#details.replaceChildren();
        }
      }
    );
  }
}

export default ChoiceWindow;
