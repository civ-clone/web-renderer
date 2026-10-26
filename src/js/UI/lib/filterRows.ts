// Narrowing a list by typing (#661): each row's text, as the player sees it, against what they've typed.

/** `text` with case and accents folded away, so `zurich` finds `Zürich`. */
export const fold = (text: string): string =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();

/**
 * Whether the characters of `query` appear in `text` in order, but not necessarily next to each other: `musk` matches
 * "Musketmen" and "Murmansk". Both are expected folded already.
 */
export const matches = (query: string, text: string): boolean => {
  let from = 0;

  for (const character of query) {
    const at = text.indexOf(character, from);

    if (at === -1) {
      return false;
    }

    from = at + character.length;
  }

  return true;
};

export const filteredOutClass = 'filtered-out';

/**
 * Hides the rows under a root that don't match a query, and any group none of whose rows do. Rows are hidden, never
 * moved, so a list keeps its order. Each row's folded text is kept until `forget()`, which a window calls when it
 * replaces its rows.
 */
export class RowFilter {
  #groupSelector: string | null;
  #rowSelector: string;
  #texts = new WeakMap<Element, string>();

  constructor(rowSelector: string, groupSelector: string | null = null) {
    this.#groupSelector = groupSelector;
    this.#rowSelector = rowSelector;
  }

  /** Shows the rows under `root` that match `query` and hides the rest, returning how many are shown. */
  apply(root: Element, query: string): number {
    const folded = fold(query.trim());
    let shown = 0;

    root.querySelectorAll(this.#rowSelector).forEach((row) => {
      const match = folded === '' || matches(folded, this.#text(row));

      row.classList.toggle(filteredOutClass, !match);

      if (match) {
        shown++;
      }
    });

    if (this.#groupSelector !== null) {
      root
        .querySelectorAll(this.#groupSelector)
        .forEach((group) =>
          group.classList.toggle(
            filteredOutClass,
            folded !== '' &&
              Array.from(group.querySelectorAll(this.#rowSelector)).every(
                (row) => row.classList.contains(filteredOutClass)
              )
          )
        );
    }

    return shown;
  }

  forget(): void {
    this.#texts = new WeakMap();
  }

  // Every column the player can see, whatever it means (#274). Read the first time a row is filtered, while it's shown.
  #text(row: Element): string {
    if (!this.#texts.has(row)) {
      this.#texts.set(
        row,
        fold((row as HTMLElement).innerText ?? row.textContent ?? '')
      );
    }

    return this.#texts.get(row)!;
  }
}

export default RowFilter;
