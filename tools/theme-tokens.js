#!/usr/bin/env node

// Every colour and type face in the interface comes from a theme's tokens (#736, #737), so a theme is only a set of
// tokens. Compiles `src/css/app.scss` and checks that:
//
// - no declaration outside a theme's token blocks (the rules on `:root`, and a theme's `.window` under it) has a colour
//   literal: a hex colour, `rgb()`/`hsl()` of plain numbers, or a named colour;
// - none outside them names a type face or sets a bold weight: type comes by role (`--type-*`), and `@font-face` only
//   declares the faces a theme may name;
// - Civ1 classic (`:root`) and slate and brass (`:root[data-ui-theme='slate']`) define the same tokens, and each dark
//   set only overrides tokens its light set defines;
// - every `--ui-*`, `--y-*`, `--font-*` and `--type-*` token a component reads is defined.

const path = require('path');

const sass = require('sass');
const { webRenderer } = require('./lib/paths');

const failures = [];
let checks = 0;

const expect = (description, passed) => {
  checks++;

  if (!passed) {
    failures.push(description);
  }
};

const { css } = sass.compile(path.join(webRenderer, 'src', 'css', 'app.scss'), {
    loadPaths: [path.join(webRenderer, 'node_modules')],
    silenceDeprecations: ['import', 'global-builtin', 'color-functions'],
    logger: sass.Logger.silent,
  }),
  // `[selector, declarations]` for each rule, inside `@media` or not. Comments go first.
  rules = [
    ...css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .matchAll(/(@?[^{}@;]+)\{([^{}]*)\}/g),
  ].map(([, selector, body]) => [
    // Sass drops the quotes in `[data-theme='dark']`; so do the selectors here.
    selector.trim().replace(/\s+/g, ' ').replace(/['"]/g, ''),
    body
      .split(/;(?![^(]*\))/)
      .map((declaration) => declaration.trim())
      .filter((declaration) => declaration.includes(':'))
      .map((declaration) => {
        const colon = declaration.indexOf(':');

        return [
          declaration.slice(0, colon).trim(),
          declaration.slice(colon + 1).trim(),
        ];
      }),
  ]),
  isTokenRule = (selector) => selector.startsWith(':root'),
  isFontFace = (selector) => selector === '@font-face',
  typeLiteral = (property, value) =>
    (property === 'font-family' && !/^(var\(|inherit$)/.test(value)) ||
    (property === 'font-weight' && /^(bold|bolder|[5-9]00)$/.test(value)),
  namedColours =
    /\b(black|white|red|green|blue|yellow|orange|purple|pink|gr[ae]y|silver|gold|brown|cyan|magenta|navy|teal|maroon|olive|lime|aqua|fuchsia)\b/i,
  colourLiteral = (value) => {
    // Token names (`--y-gold`) aren't colours.
    const bare = value.replace(/var\(--[\w-]+/g, 'var(');

    return (
      /#[0-9a-f]{3,8}\b/i.test(bare) ||
      /\b(rgba?|hsla?)\(\s*(?!from\s+var\()/i.test(bare) ||
      namedColours.test(bare)
    );
  },
  defined = (selector) =>
    new Set(
      rules
        .filter(
          ([ruleSelector]) => ruleSelector === selector.replace(/['"]/g, '')
        )
        .flatMap(([, declarations]) => declarations)
        .map(([property]) => property)
        .filter(
          (property) => property.startsWith('--') && property !== '--scale'
        )
    );

rules
  .filter(([selector]) => !isTokenRule(selector) && !isFontFace(selector))
  .forEach(([selector, declarations]) =>
    declarations.forEach(([property, value]) => {
      expect(
        `${selector} { ${property}: ${value} } has a colour literal: use a theme token`,
        !colourLiteral(value)
      );
      expect(
        `${selector} { ${property}: ${value} } sets type directly: use a --type-* or --font-* token`,
        !typeLiteral(property, value)
      );
    })
  );

const classic = defined(':root'),
  slate = defined(":root[data-ui-theme='slate']"),
  sets = {
    'Civ1 classic dark': [
      classic,
      defined(":root:not([data-ui-theme]):not([data-theme='light'])"),
    ],
    'Civ1 classic dark (chosen)': [
      classic,
      defined(":root:not([data-ui-theme])[data-theme='dark']"),
    ],
    'slate dark': [
      slate,
      defined(":root[data-ui-theme='slate']:not([data-theme='light'])"),
    ],
    'slate dark (chosen)': [
      slate,
      defined(":root[data-ui-theme='slate'][data-theme='dark']"),
    ],
  };

expect('Civ1 classic defines tokens', classic.size > 40);

[...classic]
  .filter((token) => !slate.has(token))
  .forEach((token) => expect(`slate doesn't define ${token}`, false));
[...slate]
  .filter((token) => !classic.has(token))
  .forEach((token) => expect(`Civ1 classic doesn't define ${token}`, false));

Object.entries(sets).forEach(([name, [light, dark]]) => {
  expect(`${name} defines tokens`, dark.size > 0);

  [...dark]
    .filter((token) => !light.has(token))
    .forEach((token) =>
      expect(`${name} sets ${token}, which its light set doesn't`, false)
    );
});

new Set(
  [...css.matchAll(/var\((--(?:ui|y|font|type)-[\w-]+)/g)].map(
    ([, token]) => token
  )
).forEach((token) =>
  expect(`${token} is read but no theme defines it`, classic.has(token))
);

if (failures.length) {
  process.stderr.write(
    `FAIL themeTokens\n${failures
      .map((failure) => `  ${failure}`)
      .join('\n')}\n`
  );
  process.exit(1);
}

console.log(`PASS themeTokens (${checks} checks)`);
