// Starting where the browser gives the game nothing to keep things in (#850): a store that can't be opened is heard of
//  by whoever uses it, not thrown as it is made nor left as a rejection nobody handled, and a start that fails for any
//  reason is said on the page rather than only logged.

// Must stay first: modules read `document` as they load.
import './lib/dom';
import './lib/interfaces';

import { AssetStore } from '@civ-clone/ui-assets/AssetStore';
import { Store } from '@civ-clone/ui-platform/Store';
import showStartFailure from '@civ-clone/ui-game/app/startFailure';
import i18next from 'i18next';
import i18nOptions from '@civ-clone/ui-game/app/i18nOptions';

const failures: string[] = [];
let checks = 0,
  finished = false;

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

// A suite that stops before its checks would otherwise pass in silence (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      `FAIL start-failure: stopped after ${checks} checks\n`
    );
    process.exitCode = 1;
  }
});

const unhandled: unknown[] = [];

process.on('unhandledRejection', (reason) => unhandled.push(reason));

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

(async () => {
  // A browser that blocks storage refuses the database as it is asked for, by throwing. (`./lib/dom` has one that
  //  never answers, for everything else.)
  (globalThis as any).indexedDB = {
    open: (): never => {
      const error = new Error('The operation is insecure.');

      error.name = 'SecurityError';

      throw error;
    },
  };

  let thrown: unknown = null,
    store: Store<any> | null = null;

  try {
    store = new Store<any>('civ-clone-test', 'things');
  } catch (error) {
    thrown = error;
  }

  expect('making a store throws nothing', thrown, null);

  await settle();
  await settle();

  expect('and leaves no rejection unhandled', unhandled.length, 0);

  let refused: string | null = null;

  try {
    await store!.get('anything');
  } catch (error) {
    refused = (error as Error).name;
  }

  expect(
    'whoever reads from it hears that it could not open',
    refused,
    'SecurityError'
  );

  // The sprites' store, asked what has been imported: nothing, as far as it can tell, so the menus, the cursor and the
  //  music start as they do for a player who has imported nothing.
  const assets = new AssetStore();

  expect(
    'a store of sprites that can’t be read answers as an empty one',
    [
      await assets.hasAllAssets(),
      (await assets.missingAssets()).length === assets.requiredAssets.length,
      await assets.importedCount(),
      await assets.hasSoundDriver(),
      await assets.soundDriver(),
    ],
    [false, true, 0, false, null]
  );
  expect('and still leaves no rejection unhandled', unhandled.length, 0);

  // Before the game's text has loaded, in English.
  const reloads: number[] = [],
    early = showStartFailure(
      new Error('The operation is insecure.'),
      document.body,
      () => reloads.push(1)
    );

  expect(
    'said in a dialog, with what went wrong, before any text has loaded',
    [
      early.tagName,
      early.getAttribute('role'),
      early.hasAttribute('open'),
      Array.from(early.querySelectorAll('p')).map(
        (paragraph) => paragraph.textContent
      ),
      early.querySelector('button')?.textContent,
    ],
    [
      'DIALOG',
      'alertdialog',
      true,
      [
        'The game could not start. Reload the page to try again.',
        'The operation is insecure.',
      ],
      'Reload',
    ]
  );

  early.querySelector('button')!.dispatchEvent(new Event('click'));
  expect('its button reloads the page', reloads.length, 1);
  early.remove();

  await i18next.init({ ...i18nOptions, lng: 'en' });
  await import('./lib/strings');

  // An error's text can come from a save file: shown, never parsed.
  const late = showStartFailure('<img src=x onerror=alert(1)>');

  expect(
    'with the text loaded, in the game’s words, and the error as text',
    [
      late.querySelector('p')?.textContent,
      late.querySelectorAll('p')[1]?.textContent,
      late.querySelector('img'),
      late.querySelector('button')?.textContent,
    ],
    [
      i18next.t('StartFailure.body'),
      '<img src=x onerror=alert(1)>',
      null,
      i18next.t('StartFailure.reload'),
    ]
  );
  expect(
    'and the words are the game’s, not their keys',
    i18next.t('StartFailure.body'),
    'The game could not start. Reload the page to try again.'
  );
  late.remove();

  // The game's text is fetched after i18next starts: a start that fails in between has no string yet, and says it in
  //  English rather than showing the key.
  i18next.removeResourceBundle('en', 'default');

  const between = showStartFailure(new Error('no text yet'));

  expect(
    'with i18next started but its text not loaded, the English and not the keys',
    [
      between.querySelector('p')?.textContent,
      between.querySelector('button')?.textContent,
    ],
    ['The game could not start. Reload the page to try again.', 'Reload']
  );
  between.remove();

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL start-failure: ${
        failures.length
      } of ${checks} checks\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS start-failure: ${checks} checks\n`);
  process.exit(0);
})();
