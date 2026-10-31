#!/usr/bin/env node

// The interface's icons are glyphs from `lib/glyphs.ts` (#741), drawn in the theme's colours: no `feather-icons`, no
// SVG drawn as a background picture, and no text character standing in for an icon (a ▾, a lone ×). Read from the
// source, so a window no test opens is checked too. Pictures such as the main menu's background are left alone. Every
// `glyph('…')` has to name one the sheet has.

const fs = require('fs');
const path = require('path');

const { webRenderer } = require('./lib/paths');

const roots = [
    path.join(webRenderer, 'src', 'js', 'UI'),
    path.join(webRenderer, 'src', 'css'),
  ],
  failures = [];
let checks = 0;

const files = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);

    return entry.isDirectory()
      ? files(full)
      : /\.(ts|scss)$/.test(full)
      ? [full]
      : [];
  });

const rules = [
  [/feather-icons/, 'uses feather-icons: use a glyph'],
  [/url\([^)]*\.svg/, 'draws an SVG as a picture: use a glyph'],
  [/[▾▸▴◂▼▲►◄✕✖✓✔☰]|&times;/, 'uses a text character as an icon: use a glyph'],
  [/<button[^>]*>\s*×\s*<\/button>/, 'uses × as a button: use the close glyph'],
];

roots.flatMap(files).forEach((file) => {
  const name = path.relative(webRenderer, file);

  fs.readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      // Comments may name what they replaced.
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) {
        return;
      }

      rules.forEach(([pattern, message]) => {
        checks++;

        if (pattern.test(line)) {
          failures.push(`${name}:${index + 1} ${message}: ${line.trim()}`);
        }
      });
    });
});

// Every `glyph('…')` names a glyph in the sheet.
const sheet = fs.readFileSync(
    path.join(webRenderer, 'src', 'js', 'UI', 'lib', 'glyphs.ts'),
    'utf8'
  ),
  defined = new Set(
    [
      ...sheet
        .slice(sheet.indexOf('const glyphs = {'), sheet.indexOf('\n};'))
        .matchAll(/^ {2}'?([\w-]+)'?:/gm),
    ].map(([, name]) => name)
  );

files(roots[0]).forEach((file) => {
  for (const match of fs
    .readFileSync(file, 'utf8')
    .matchAll(/\bglyph\('([\w-]+)'\)/g)) {
    checks++;

    if (!defined.has(match[1])) {
      failures.push(
        `${path.relative(webRenderer, file)} uses glyph('${
          match[1]
        }'), which the sheet doesn't have`
      );
    }
  }
});

// A glyph takes no clicks, so a click on one reaches the control it sits in: several handlers only accept an
// `HTMLElement` target, and an `<svg>` isn't one.
{
  const icons = fs.readFileSync(
      path.join(webRenderer, 'src', 'css', 'components', '_icons.scss'),
      'utf8'
    ),
    rule = icons.slice(
      icons.indexOf('.glyph {'),
      icons.indexOf('}', icons.indexOf('.glyph {'))
    );

  checks++;

  if (!/pointer-events:\s*none/.test(rule)) {
    failures.push(
      'src/css/components/_icons.scss: .glyph needs pointer-events: none'
    );
  }
}

if (failures.length) {
  process.stderr.write(
    `FAIL glyphs\n${failures.map((failure) => `  ${failure}`).join('\n')}\n`
  );
  process.exit(1);
}

console.log(`PASS glyphs (${checks} checks)`);
