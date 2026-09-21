// Does a save survive the reload it is loaded through, and is the player told
// when it cannot?
//
// Loading a save reloads the page — that is how the engine gets a worker with
// no rules registered in it — and the save is handed over on the way. It was
// handed over in `sessionStorage`, which browsers cap at around 5M characters,
// and the thing handed over is the *uncompressed* JSON: 1.6MB on turn 1, and
// 7.7MB to 11.5MB by turn 110 or so. So `setItem` threw `QuotaExceededError`
// outside the `try`, the page did not reload, and nothing was said (#5).
//
// The size limit lives in the `sessionStorage` stand-in below, so "too big"
// here means what it means in a browser.

import { failStore, resetStore, storedRecords } from './lib/FakeStore';
import {
  fileName,
  loadSaveFromFile,
  takePendingSave,
} from '../../src/js/UI/lib/savedGame';
import i18next, { t } from 'i18next';

// Everything `savedGame.ts` reaches for outside itself, it reaches for when it
// is called rather than when it is imported, so these can be set up here.
const SESSION_STORAGE_LIMIT = 5 * 1024 * 1024;

const session = new Map<string, string>();

let alerts: string[] = [];
let reloads = 0;

(globalThis as any).sessionStorage = {
  getItem: (key: string): string | null => session.get(key) ?? null,
  setItem: (key: string, value: string): void => {
    const total = [...session.entries()]
      .filter(([name]) => name !== key)
      .reduce((size, [name, held]) => size + name.length + held.length, 0);

    if (total + key.length + value.length > SESSION_STORAGE_LIMIT) {
      const error = new Error(
        `Failed to execute 'setItem' on 'Storage': Setting the value of '${key}' exceeded the quota.`
      );

      error.name = 'QuotaExceededError';

      throw error;
    }

    session.set(key, value);
  },
  removeItem: (key: string): void => {
    session.delete(key);
  },
};

(globalThis as any).window = {
  alert: (message: string): void => {
    alerts.push(message);
  },
  location: {
    reload: (): void => {
      reloads += 1;
    },
  },
};

const failures: string[] = [];
const checks: string[] = [];

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks.push(description);

  if (actual !== expected) {
    failures.push(
      `${description}\n    expected: ${expected}\n    actual:   ${actual}`
    );
  }
};

/**
 * A save of roughly the shape `loadSaveFromFile` insists on, at a given size.
 *
 * Repetitive on purpose: a real save is mostly repeated field names and
 * `{"$ref":"Tile-1f4"}`, which is why it gzips to a fortieth of itself.
 */
const save = (characters: number): string => {
  const entity = (index: number): unknown => ({
      $id: `Tile-${index.toString(16)}`,
      $class: 'Tile',
      terrain: { $ref: 'Terrain-1' },
      improvements: [],
    }),
    perEntity = JSON.stringify(entity(0)).length + 1,
    entities = [];

  for (let index = 0; index * perEntity < characters; index++) {
    entities.push(entity(index));
  }

  return JSON.stringify({ format: 2, entities });
};

const gzipped = async (data: string): Promise<Uint8Array> =>
  new Uint8Array(
    await new Response(
      new Blob([data]).stream().pipeThrough(new CompressionStream('gzip'))
    ).arrayBuffer()
  );

const reset = () => {
  session.clear();
  resetStore();
  alerts = [];
  reloads = 0;
};

(async () => {
  await i18next.init({ lng: 'en', defaultNS: 'default', ns: ['default'] });
  await import('../../translations/local/en');

  expect(
    'a file name keeps what a file system will take',
    fileName('The Aztec, turn 130, 1000BC', 'json.gz'),
    'The Aztec, turn 130, 1000BC.civ-clone.json.gz'
  );

  // The bug: gzipped this is a couple of hundred KB, and it is the 8MB inside
  // it that has to cross the reload.
  reset();

  const large = save(8 * 1024 * 1024);

  // The premise, so this cannot quietly stop testing what it is named for.
  let refused = '';

  try {
    sessionStorage.setItem('civ-clone:pending-save', large);
  } catch (error) {
    refused = (error as Error).name;
  }

  expect(
    'a turn-130 save is too big for sessionStorage',
    refused,
    'QuotaExceededError'
  );

  session.clear();

  await loadSaveFromFile(
    new File([await gzipped(large)], 'large.civ-clone.json.gz')
  );

  expect(
    'a save larger than the sessionStorage limit is handed over (#5)',
    storedRecords().get('civ-clone:pending-save'),
    large
  );
  expect('and the page reloads into it', reloads, 1);
  expect('with nothing said to the player', alerts.length, 0);
  expect(
    'and only a marker left in sessionStorage',
    (session.get('civ-clone:pending-save') ?? '').length < 64,
    true
  );

  expect(
    'the save comes back after the reload',
    await takePendingSave(),
    large
  );
  expect(
    'once, and only once — one reload, one go',
    await takePendingSave(),
    null
  );

  // `sessionStorage` is per-tab; the store it now sits in is per-origin.
  reset();

  await loadSaveFromFile(new File([await gzipped(large)], 'large.json.gz'));
  session.clear();

  expect(
    'a save with no marker is not another tab’s to take',
    await takePendingSave(),
    null
  );

  // A plain-JSON save, as a browser with no `CompressionStream` writes.
  reset();

  const small = save(1024);

  await loadSaveFromFile(new File([small], 'small.civ-clone.json'));

  expect('an uncompressed save reads too', await takePendingSave(), small);

  // Storage refused: the page must not reload, because there would be nothing
  // on the other side of it.
  reset();
  failStore(new Error('the quota has been exceeded'));

  let thrown: Error | null = null;

  await loadSaveFromFile(new File([small], 'small.civ-clone.json')).catch(
    (error: Error) => (thrown = error)
  );

  expect('a hand-over that fails tells the player', alerts.length, 1);
  expect(
    'saying the game has not been loaded',
    alerts[0],
    t('SavedGame.could-not-hand-over', { error: 'the quota has been exceeded' })
  );
  expect('and does not reload', reloads, 0);
  expect('and rejects, rather than failing silently', thrown !== null, true);

  failStore(null);

  expect('leaving no marker behind', session.size, 0);
  expect('and nothing in the store', storedRecords().size, 0);

  // A file that is not a save never reaches the hand-over.
  reset();

  await loadSaveFromFile(
    new File([JSON.stringify({ hello: 'world' })], 'notes.json')
  ).catch(() => {});

  expect(
    'a file that is not a save is reported',
    alerts[0],
    t('SavedGame.could-not-read', { error: t('SavedGame.not-a-save') })
  );
  expect('and nothing is handed over', storedRecords().size, 0);
  expect('and the page stays where it is', reloads, 0);

  if (failures.length) {
    console.error(`FAIL savedGame\n  ${failures.join('\n  ')}`);

    process.exit(1);
  }

  console.log(`PASS savedGame (${checks.length} checks)`);
})();
