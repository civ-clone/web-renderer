// The interface's glyphs (#741): one monochrome set for its chrome, drawn in `currentColor` so a theme colours them
//  with its tokens. Game objects (units, yields, improvements) come from the tileset's sprites instead.
//
// Most shapes are Feather's (https://feathericons.com, MIT, © 2013-2023 Cole Bemis), on its 24-unit grid with a
//  2-unit round stroke, as the interface drew them before.

const glyphs = {
  close:
    '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  maximise:
    '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>',
  minimise:
    '<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>',
  menu: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
  globe:
    '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  'end-turn':
    '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  'arrow-right':
    '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  'chevron-down': '<polyline points="6 9 12 15 18 9"/>',
  // A filled triangle, for a section that opens and closes, the size the text's ▾ was.
  disclosure: '<path d="M5 8h14l-7 9z" fill="currentColor" stroke="none"/>',
};

export type GlyphName = keyof typeof glyphs;

export const glyphNames = Object.keys(glyphs) as GlyphName[];

const sheetId = 'glyphs';

/** The glyph called `name`, as markup: decorative, so the control it sits in needs its own label. */
export const glyph = (name: GlyphName): string =>
  `<svg class="glyph glyph-${name}" aria-hidden="true" focusable="false"><use href="#g-${name}"></use></svg>`;

/** Adds the symbols every `glyph()` refers to, once, at the start of `body`. */
export const installGlyphs = (doc: Document = document): void => {
  if (doc.getElementById(sheetId)) {
    return;
  }

  const holder = doc.createElement('div');

  holder.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" id="${sheetId}" class="glyph-sheet" aria-hidden="true">${glyphNames
    .map(
      (name) =>
        `<symbol id="g-${name}" viewBox="0 0 24 24">${glyphs[name]}</symbol>`
    )
    .join('')}</svg>`;

  doc.body.prepend(holder.firstElementChild!);
};

export default glyph;
