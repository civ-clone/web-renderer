// The Releases window loads the release notes when it opens rather than having
// them bundled into `frontend.js` (#476): it says it's loading, then shows one
// entry per day, or says the notes couldn't be loaded. `fetchReleases` asks for
// `dist/releases.json` with the build's version on the URL, and a failed
// response is a failure rather than notes. `tools/release-window.js` also
// checks that nothing in `frontend.js` imports `releases.json` any more.

// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';

import ReleaseWindow, {
  fetchReleases,
} from '../../src/js/UI/components/ReleaseWindow';
import { Release } from '../../src/js/UI/lib/releaseDays';
import i18next from 'i18next';

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

const releases: Release[] = [
  {
    version: '0.1.0@bbbbbbb',
    date: '2026-10-21T12:00:00.000Z',
    localChanges: ['You can now pick Random (#15).'],
    externalChanges: {},
  },
  {
    version: '0.1.0@aaaaaaa',
    date: '2026-10-20T12:00:00.000Z',
    localChanges: ['chore: tidy up'],
    externalChanges: {
      'civ1-unit': { status: 'updated', log: ['Settlers dig faster.'] },
    },
  },
];

const text = (window: ReleaseWindow): string =>
  (window.element().querySelector('.release-list')?.textContent ?? '')
    .replace(/\s+/g, ' ')
    .trim();

const run = async () => {
  // Every key as itself.
  await i18next.init({ lng: 'cimode' });

  let resolve: (releases: Release[]) => void = () => {};

  const pending = new ReleaseWindow(
    () => new Promise<Release[]>((done) => (resolve = done))
  );

  expect(
    'while the notes load, the window says so',
    text(pending),
    'ReleaseWindow.loading'
  );

  resolve(releases);
  await pending.loaded();

  const shown = pending.element().querySelectorAll('.release');

  expect('then shows one entry per day', shown.length, 2);
  expect(
    'with the newest first, open',
    [
      shown[0].querySelector('h2')?.textContent?.split(' - ')[0],
      shown[0].querySelector('h2 + div')?.getAttribute('aria-expanded'),
    ],
    ['0.1.0@bbbbbbb', 'true']
  );
  expect(
    "and each day's changes",
    [...pending.element().querySelectorAll('.release li')].map((item) =>
      item.textContent?.trim()
    ),
    ['You can now pick Random (#15).', 'chore: tidy up', 'Settlers dig faster.']
  );

  // The arrow is a glyph, an `<svg>` rather than an `HTMLElement`, and clicking it opens and closes the day (#741).
  const arrow = shown[0].querySelector('h2 > svg');

  arrow?.dispatchEvent(new Event('click', { bubbles: true }));
  expect(
    "clicking a day's arrow closes it",
    shown[0].querySelector('h2 + div')?.getAttribute('aria-expanded'),
    'false'
  );

  pending.close();

  // A note's Markdown is rendered, but any HTML in it is shown as text, and a link or image as its text (#583).
  const marked = new ReleaseWindow(() =>
    Promise.resolve([
      {
        version: '0.1.0@eeeeeee',
        date: '2026-10-23T12:00:00.000Z',
        localChanges: [
          'Each `<Government>` is **listed**.',
          'A <b>bold</b> <img src=x onerror="alert(1)"> note.',
          'See [the issue](javascript:alert(1)) and ![a picture](https://example.com/x.png).',
        ],
        externalChanges: {},
      },
    ])
  );

  await marked.loaded();

  const items = [...marked.element().querySelectorAll('.release li')];

  expect(
    'code and bold are rendered, HTML in code kept as text',
    [
      items[0].querySelector('code')?.textContent,
      items[0].querySelector('strong')?.textContent,
    ],
    ['<Government>', 'listed']
  );
  expect(
    'HTML in a note is shown as text, and makes no element',
    [items[1].textContent?.trim(), items[1].querySelectorAll('b, img').length],
    ['A <b>bold</b> <img src=x onerror="alert(1)"> note.', 0]
  );
  expect(
    'a link or an image is shown as its text',
    [items[2].textContent?.trim(), items[2].querySelectorAll('a, img').length],
    ['See the issue and a picture.', 0]
  );

  marked.close();

  const failed = new ReleaseWindow(() =>
    Promise.reject(new Error('404 Not Found'))
  );

  const consoleError = console.error;
  console.error = () => {};
  await failed.loaded();
  console.error = consoleError;

  expect(
    "notes that can't be loaded say so, rather than an empty window",
    text(failed),
    'ReleaseWindow.failed'
  );

  failed.close();

  // An entry with no `localChanges`, which the window can't show.
  const malformed = new ReleaseWindow(() =>
    Promise.resolve([
      { version: '0.1.0@ddddddd', date: '2026-10-22T12:00:00.000Z' },
    ] as unknown as Release[])
  );

  console.error = () => {};
  await malformed.loaded();
  console.error = consoleError;

  expect(
    "notes that load but can't be shown say so too, rather than loading forever",
    text(malformed),
    'ReleaseWindow.failed'
  );

  malformed.close();

  const requested: string[] = [];

  (globalThis as any).fetch = (url: string) => {
    requested.push(url);

    return Promise.resolve(
      url.includes('missing')
        ? { ok: false, status: 404, statusText: 'Not Found' }
        : { ok: true, json: () => Promise.resolve(releases) }
    );
  };

  expect(
    'fetchReleases reads dist/releases.json',
    (await fetchReleases('0.1.0@ccccccc')).length,
    2
  );
  expect(
    "with the build's version on the URL, so a cached copy can't outlive a deploy",
    requested,
    ['dist/releases.json?v=0.1.0%40ccccccc']
  );
  expect(
    'and a failed response is a failure, not notes',
    await fetchReleases('missing').then(
      () => 'resolved',
      (error: Error) => error.message
    ),
    '404 Not Found'
  );

  document.body.innerHTML = '';

  if (failures.length > 0) {
    process.stderr.write(`FAIL releaseWindow\n  ${failures.join('\n  ')}\n`);
    process.exit(1);
  }

  process.stdout.write(`PASS releaseWindow (${checks} checks)\n`);
};

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exit(1);
});
