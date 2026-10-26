// Narrowing a list by typing (#661): each row's text, as the player sees it, against what they've typed.

// Letters that are their own letter, not one with an accent, so taking the accents away leaves them as they were.
const letters: { [letter: string]: string } = {
  æ: 'ae',
  ð: 'd',
  đ: 'd',
  ı: 'i',
  ł: 'l',
  ø: 'o',
  œ: 'oe',
  ß: 'ss',
  þ: 'th',
};

/**
 * `text` with case and accents folded away, so `zurich` finds `Zürich` and `lodz` finds `Łódź`, and any run of spaces,
 * tabs or line breaks as one space, so `moscow musk` finds a row whose columns are "Moscow" and "Musketmen".
 */
export const fold = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    // Not `toLocaleLowerCase`: in Turkish, `I` would become `ı`, and `i` would no longer find it.
    .toLowerCase()
    .replace(/[æðđıłøœßþ]/g, (letter) => letters[letter])
    .replace(/\s+/g, ' ');

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
    const folded = fold(query.trim()),
      rows = Array.from(root.querySelectorAll(this.#rowSelector)),
      // Every row read before any is hidden or shown: reading after a change would lay the window out again each time.
      matching = rows.map(
        (row) => folded === '' || matches(folded, this.#text(row))
      );

    rows.forEach((row, index) =>
      row.classList.toggle(filteredOutClass, !matching[index])
    );

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

    return matching.filter((match) => match).length;
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
