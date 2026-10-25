// Saves kept in the browser (#653): the player's own and each new game's start are kept until deleted, only the newest
// autosave is kept, they are listed newest first, a write the browser refuses is said rather than thrown, and the
// turns saved are the ones the player asked for.

import {
  KEEP_AUTOSAVES,
  SaveKind,
  autosaveDue,
  deleteSave,
  keepSave,
  listSaves,
} from '../../src/js/UI/lib/browserSaves';
import {
  failStore,
  limitStore,
  resetStore,
  storedRecords,
} from './lib/FakeStore';

const failures: string[] = [];
const checks: string[] = [];

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks.push(description);

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${description}\n    expected: ${JSON.stringify(
        expected
      )}\n    actual:   ${JSON.stringify(actual)}`
    );
  }
};

let persistCalls = 0;

Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    storage: {
      persisted: async (): Promise<boolean> => false,
      persist: async (): Promise<boolean> => {
        persistCalls++;

        return true;
      },
    },
  },
});

(async () => {
  const reported: string[] = [],
    report = (error: Error): void => void reported.push(error.message),
    keep = (name: string, kind: SaveKind, savedAt: number) =>
      keepSave(name, new Blob([name]), kind, report, () => savedAt),
    listed = async (): Promise<string[]> =>
      (await listSaves()).map(({ name, kind }) => `${name} (${kind})`);

  expect('one autosave is kept', KEEP_AUTOSAVES, 1);

  expect(
    'a new game keeps its start',
    await keep('turn 1', 'start', 1001),
    true
  );
  await keep('turn 5', 'autosave', 1005);
  await keep('turn 7', 'player', 1007);
  await keep('turn 10', 'autosave', 1010);
  await keep('turn 15', 'autosave', 1015);

  expect(
    'newest first, with only the newest autosave, and every other save kept',
    await listed(),
    ['turn 15 (autosave)', 'turn 7 (player)', 'turn 1 (start)']
  );
  expect('nothing else is left behind', storedRecords().size, 3);

  const [newest] = await listSaves();

  expect(
    'each keeps the file as it was given',
    await newest.data.text(),
    'turn 15'
  );
  expect('with when it was kept', newest.savedAt, 1015);
  expect('nothing was reported', reported, []);
  expect('persistent storage is asked for, once', persistCalls, 1);

  await deleteSave(1007);

  expect('a save the player deletes is gone', await listed(), [
    'turn 15 (autosave)',
    'turn 1 (start)',
  ]);

  // Storage full, or refused: said, and the game goes on.
  failStore(new Error('the quota has been exceeded'));

  let threw = false;

  const kept = await keep('turn 20', 'autosave', 1020).catch(
    () => (threw = true)
  );

  expect('a write the browser refuses is reported', reported, [
    'the quota has been exceeded',
  ]);
  expect('not thrown', threw, false);
  expect('and says it was not kept', kept, false);
  expect('and storage that cannot be read lists none', await listSaves(), []);

  failStore(null);

  expect('and those kept before are still there', await listed(), [
    'turn 15 (autosave)',
    'turn 1 (start)',
  ]);

  // Storage with room for only these two: the autosave is let go to make room for the next, rather than every
  //  autosave failing from then on.
  limitStore(2);
  reported.length = 0;

  await keep('turn 20', 'autosave', 1020);

  expect(
    'full storage lets the old autosave go to keep the new one',
    await listed(),
    ['turn 20 (autosave)', 'turn 1 (start)']
  );
  expect('and says nothing', reported, []);

  // A save of the player's own when full: the autosave goes rather than it.
  await keep('turn 21', 'player', 1021);

  expect("a player's save when full lets the autosave go", await listed(), [
    'turn 21 (player)',
    'turn 1 (start)',
  ]);

  // Nothing left to let go: said, and nothing the player saved is lost.
  const keptWhenFull = await keep('turn 22', 'player', 1022);

  expect('with nothing to let go it is not kept', keptWhenFull, false);
  expect('and is reported', reported, ['the quota has been exceeded']);
  expect("and nothing of the player's is let go", await listed(), [
    'turn 21 (player)',
    'turn 1 (start)',
  ]);

  resetStore();

  // Which turns are saved: a new game's first, kept as its start, then an autosave every 5, 10 or 20 turns where that
  //  is chosen.
  const due = (
    choice: string,
    { newGame = true }: { newGame?: boolean } = {}
  ): string[] =>
    [1, 2, 5, 10, 15, 20, 40].flatMap((turn, index) => {
      const kind = autosaveDue(turn, choice, {
        firstOfSession: index === 0,
        newGame,
      });

      return kind === null ? [] : [`${turn} ${kind}`];
    });

  expect('game start only', due('start'), ['1 start']);
  expect('game start, then every 5 turns', due('5'), [
    '1 start',
    '5 autosave',
    '10 autosave',
    '15 autosave',
    '20 autosave',
    '40 autosave',
  ]);
  expect('game start, then every 10 turns', due('10'), [
    '1 start',
    '10 autosave',
    '20 autosave',
    '40 autosave',
  ]);
  expect('game start, then every 20 turns', due('20'), [
    '1 start',
    '20 autosave',
    '40 autosave',
  ]);
  expect('off', due('off'), []);
  expect('a choice nobody offers is off', due('2'), []);
  expect(
    'a loaded game is not saved as it resumes',
    due('5', { newGame: false }),
    ['5 autosave', '10 autosave', '15 autosave', '20 autosave', '40 autosave']
  );
  expect('nor with game start only', due('start', { newGame: false }), []);

  if (failures.length) {
    console.error(`FAIL browserSaves\n  ${failures.join('\n  ')}`);

    process.exit(1);
  }

  console.log(`PASS browserSaves (${checks.length} checks)`);
})();
