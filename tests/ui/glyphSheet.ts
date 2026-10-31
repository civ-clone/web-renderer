// The interface's glyphs (#741): `glyph()` refers to a symbol in the sheet `installGlyphs()` adds once, is hidden from
//  assistive technology (the control it sits in has its own label). `tools/glyphs.js` checks the names used.

// Must stay first: modules read `document` as they load.
import { document } from './lib/dom';

import glyph, { glyphNames, installGlyphs } from '../../src/js/UI/lib/glyphs';

const failures: string[] = [];
let checks = 0;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${description}\n    expected: ${JSON.stringify(
        expected
      )}\n    actual:   ${JSON.stringify(actual)}`
    );
  }
};

const doc = document as unknown as Document;

{
  const holder = doc.createElement('div');

  holder.innerHTML = glyph('close');

  const svg = holder.querySelector('svg')!;

  expect('a glyph is an svg', svg?.tagName.toLowerCase(), 'svg');
  expect('with its classes', svg.getAttribute('class'), 'glyph glyph-close');
  expect(
    'hidden from assistive technology',
    svg.getAttribute('aria-hidden'),
    'true'
  );
  expect('not a tab stop', svg.getAttribute('focusable'), 'false');
  expect(
    'using its symbol',
    svg.querySelector('use')?.getAttribute('href'),
    '#g-close'
  );
  expect('with no text of its own', holder.textContent, '');
}

installGlyphs(doc);
installGlyphs(doc);

expect('the sheet is added once', doc.querySelectorAll('#glyphs').length, 1);
expect('at the start of the page', doc.body.firstElementChild?.id, 'glyphs');
expect(
  'with a symbol for every glyph',
  Array.from(doc.querySelectorAll('#glyphs symbol')).map((symbol) => symbol.id),
  glyphNames.map((name) => `g-${name}`)
);

if (failures.length) {
  process.stderr.write(
    `FAIL glyphSheet\n${failures.map((failure) => `  ${failure}`).join('\n')}\n`
  );
  process.exit(1);
}

console.log(`PASS glyphSheet (${checks} checks)`);
