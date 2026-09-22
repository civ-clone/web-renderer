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
];

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
  const releases = require(path.join(webRenderer, 'changelog', 'releases.json')),
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

  if (failures.length) {
    console.error(`FAIL changelog\n  ${failures.join('\n  ')}`);

    process.exit(1);
  }

  console.log(
    `PASS changelog (${cases.length} messages; ${releases.length} entries, none empty)`
  );
})();
