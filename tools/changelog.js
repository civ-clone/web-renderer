#!/usr/bin/env node

// `toBullets` turns a commit message into the bullets `ReleaseWindow` lists
// (#51). No bundling: `generate-changelog.mjs` is plain ESM with no imports
// beyond node's own, so a dynamic `import()` is enough.

const path = require('path');
const { pathToFileURL } = require('url');

const { webRenderer } = require('./lib/paths');

const cases = [
  [
    'a subject and trailers keeps the subject',
    'release: a save from a game under way loads again\n' +
      '\n' +
      'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>\n' +
      'Claude-Session: https://claude.ai/code/session_x',
    ['release: a save from a game under way loads again'],
  ],
  [
    'a subject and nothing else keeps the subject',
    'docs: mark the render hot-path caching item done',
    ['docs: mark the render hot-path caching item done'],
  ],
  [
    'a subject with no conventional-commit prefix is kept too',
    'Ensure city names render at the bottom of the map',
    ['Ensure city names render at the bottom of the map'],
  ],
  [
    'trailers glued to the subject are still dropped',
    'fix: a thing\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>',
    ['fix: a thing'],
  ],
  [
    'a body replaces the subject, one bullet per paragraph',
    'fix: a thing\n' +
      '\n' +
      'The thing was broken\n' +
      'and is now fixed.\n' +
      '\n' +
      'Something else changed.\n' +
      '\n' +
      'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>',
    ['The thing was broken and is now fixed.', 'Something else changed.'],
  ],
  [
    'a `- ` list in the body is one bullet per item',
    'fix: a thing\n\n- one\n- two wrapped\n  over two lines\n- three',
    ['one', 'two wrapped over two lines', 'three'],
  ],
  [
    'one change per line — every commit before 2026 — is one bullet each',
    'Change one\nChange two\nChange three',
    ['Change one', 'Change two', 'Change three'],
  ],
  [
    'a trailer after two blank lines is still a trailer (#475)',
    'fix: a thing\n' +
      '\n' +
      'Jobs take as long as Civ1 says (#261).\n' +
      '\n' +
      '\n' +
      'Claude-Session: https://claude.ai/code/session_x',
    ['Jobs take as long as Civ1 says (#261).'],
  ],
  [
    'a trailer straight after the body, with no blank line, is dropped',
    'feat: X\n' +
      '\n' +
      'You can now do X.\n' +
      'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>',
    ['You can now do X.'],
  ],
  [
    'trailers split over several paragraphs are all dropped',
    'fix: a thing\n' +
      '\n' +
      'Fixed.\n' +
      '\n' +
      'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>\n' +
      '\n' +
      'Claude-Session: https://claude.ai/code/session_x',
    ['Fixed.'],
  ],
  [
    'a last paragraph such as `Note: …` is part of the notes',
    'fix: a thing\n' +
      '\n' +
      'Fixed.\n' +
      '\n' +
      'Note: saves from before this still load.\n' +
      '\n' +
      'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>',
    ['Fixed.', 'Note: saves from before this still load.'],
  ],
  [
    'so is `Warning: …` with nothing after it',
    'fix: a thing\n\nFixed.\n\nWarning: older saves lose their notes.',
    ['Fixed.', 'Warning: older saves lose their notes.'],
  ],
  [
    'a paragraph that only closes an issue is not a bullet',
    'fix: a thing\n' +
      '\n' +
      'The window opens again.\n' +
      '\n' +
      'Closes #46.\n' +
      '\n' +
      'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>',
    ['The window opens again.'],
  ],
  [
    'a body that only closes an issue leaves the subject',
    'fix: the window opens again\n\nFixes #46',
    ['fix: the window opens again'],
  ],
  [
    'closing an issue inside a sentence keeps the sentence',
    'fix: a thing\n\nCloses #51. The window lists every release.',
    ['Closes #51. The window lists every release.'],
  ],
];

// Entries that shipped with a trailer in them before #475, kept as they were
// released.
const SHIPPED_WITH_TRAILERS = ['0.1.0@f9a75f1'];

(async () => {
  const { toBullets } = await import(
    pathToFileURL(path.join(webRenderer, 'generate-changelog.mjs')).href
  );

  const failures = [];

  cases.forEach(([description, message, expected]) => {
    const actual = toBullets(message);

    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      failures.push(
        `${description}\n    expected: ${JSON.stringify(expected)}\n` +
          `    actual:   ${JSON.stringify(actual)}`
      );
    }
  });

  // Nothing empty may reach the window: an entry with no local and no external
  // changes renders as a heading above an empty block.
  const releases = require(path.join(
      webRenderer,
      'changelog',
      'releases.json'
    )),
    empty = releases.filter(
      (release) =>
        release.localChanges.length === 0 &&
        Object.keys(release.externalChanges).length === 0
    );

  if (empty.length > 0) {
    failures.push(
      `${empty.length} empty entr${
        empty.length === 1 ? 'y' : 'ies'
      } in changelog/releases.json\n    ${empty
        .map((release) => release.version)
        .join(', ')}`
    );
  }

  // No trailer may reach the window, and no bullet may start with the space a
  // trailer glued onto the line before leaves behind (#475).
  releases
    .filter((release) => !SHIPPED_WITH_TRAILERS.includes(release.version))
    .forEach((release) => {
      [
        ...release.localChanges,
        ...Object.values(release.externalChanges).flatMap(
          (change) => change.log ?? []
        ),
      ]
        .filter(
          (bullet) =>
            /^\s/.test(bullet) ||
            /(^|\s)(Co-Authored-By|Claude-Session): \S/i.test(bullet)
        )
        .forEach((bullet) =>
          failures.push(
            `a trailer in changelog/releases.json\n    ${
              release.version
            }: ${JSON.stringify(bullet)}`
          )
        );
    });

  if (failures.length) {
    console.error(`FAIL changelog\n  ${failures.join('\n  ')}`);

    process.exit(1);
  }

  console.log(
    `PASS changelog (${cases.length} messages; ${releases.length} entries, none empty)`
  );
})();
