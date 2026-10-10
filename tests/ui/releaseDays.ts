// The release window shows one entry per day, combined at display time from
// releases.json's one entry per commit (#355).

import byDay, { Release, isDevOnly } from '../../src/js/UI/lib/releaseDays';
import releases from '../../changelog/releases.json';

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

// The date's own UTC day, so the test doesn't depend on the machine's timezone.
const utcDay = (date: Date) => date.toISOString().slice(0, 10),
  release = (
    sha: string,
    date: string,
    localChanges: string[],
    externalChanges: Release['externalChanges'] = {}
  ): Release => ({
    version: `0.1.0@${sha}`,
    date,
    localChanges,
    externalChanges,
  });

{
  const days = byDay(
    [
      release('ccc', '2026-10-09T19:00:00.000Z', [
        'Railroads.',
        'test: the arena counts railroad tiles',
      ]),
      release('bbb', '2026-10-09T12:00:00.000Z', ['Smooth letters.'], {
        'base-strategy-terrain-work': { status: 'updated', log: ['newer'] },
        'civ1-unit': { status: 'updated', log: ['unit'] },
      }),
      release('aaa', '2026-10-09T08:00:00.000Z', ['docs: a doc'], {
        'base-strategy-terrain-work': { status: 'added', log: ['older'] },
      }),
      release('zzz', '2026-10-08T23:00:00.000Z', ['Yesterday.']),
    ],
    utcDay
  );

  expect('several commits on one day become one entry', days.length, 2);
  expect(
    "the day takes its newest commit's version",
    days[0].version,
    '0.1.0@ccc'
  );
  expect(
    "the day takes its newest commit's date",
    days[0].date,
    '2026-10-09T19:00:00.000Z'
  );
  expect(
    'player-facing bullets are listed newest first',
    days[0].localChanges,
    ['Railroads.', 'Smooth letters.']
  );
  expect('dev-only bullets are set aside, newest first', days[0].devChanges, [
    'test: the arena counts railroad tiles',
    'docs: a doc',
  ]);
  expect(
    "a package's logs are joined newest first",
    days[0].externalChanges['base-strategy-terrain-work'].log,
    ['newer', 'older']
  );
  expect(
    'a package added that day shows as added',
    days[0].externalChanges['base-strategy-terrain-work'].status,
    'added'
  );
  expect(
    'a package changed once keeps its status',
    days[0].externalChanges['civ1-unit'].status,
    'updated'
  );
  expect('a day with one commit passes through', days[1], {
    version: '0.1.0@zzz',
    date: '2026-10-08T23:00:00.000Z',
    localChanges: ['Yesterday.'],
    devChanges: [],
    externalChanges: {},
  });
}

{
  const input = [
      release('bbb', '2026-10-09T12:00:00.000Z', [], {
        'civ1-unit': { status: 'updated', log: ['b'] },
      }),
      release('aaa', '2026-10-09T08:00:00.000Z', [], {
        'civ1-unit': { status: 'updated', log: ['a'] },
      }),
    ],
    [day] = byDay(input, utcDay);

  expect('merging does not change the input', input[1].externalChanges, {
    'civ1-unit': { status: 'updated', log: ['a'] },
  });
  expect('the merged log has both', day.externalChanges['civ1-unit'].log, [
    'b',
    'a',
  ]);
}

{
  const days = byDay(
    [
      release('ccc', '2026-10-09T19:00:00.000Z', ['c']),
      release('bbb', '2026-10-08T12:00:00.000Z', ['b']),
      release('aaa', '2026-10-09T08:00:00.000Z', ['a']),
    ],
    utcDay
  );

  expect(
    'a commit dated out of order still joins its day',
    days.map((day) => day.localChanges),
    [['c', 'a'], ['b']]
  );
}

[
  ['chore: update packages', true],
  ['test: the arena counts railroad tiles', true],
  ['docs: bring the docs up to date', true],
  ['refactor(ui)!: split Renderer', true],
  ['- chore: a bullet with its dash', true],
  ['fix: busy units are smooth', false],
  ['feat: Settlers build railroads', false],
  ['Testing shows the docs: they are fine', false],
  ['The letters on busy units are smooth (closes #352).', false],
].forEach(([change, expected]) =>
  expect(
    `isDevOnly(${JSON.stringify(change)})`,
    isDevOnly(change as string),
    expected
  )
);

{
  const all = releases as Release[],
    days = byDay(all),
    count = (entries: { localChanges: string[] }[]) =>
      entries.reduce((total, entry) => total + entry.localChanges.length, 0),
    externalCount = (entries: Release[]) =>
      entries.reduce(
        (total, entry) =>
          total +
          Object.values(entry.externalChanges).reduce(
            (sum, { log }) => sum + (log ?? []).length,
            0
          ),
        0
      ),
    dayKeys = days.map((day) => utcDay(new Date(day.date)));

  expect(
    'no bullet from releases.json is lost',
    count(days) + days.reduce((total, day) => total + day.devChanges.length, 0),
    count(all)
  );
  expect(
    'no external log line from releases.json is lost',
    externalCount(days),
    externalCount(all)
  );
  expect(
    'releases.json gives at most one entry per day',
    new Set(byDay(all, utcDay).map((day) => utcDay(new Date(day.date)))).size,
    byDay(all, utcDay).length
  );
  expect('there are fewer days than commits', days.length < all.length, true);
  expect('every day has a date', dayKeys.every(Boolean), true);
}

if (failures.length) {
  process.stderr.write(
    `FAIL releaseDays\n${failures
      .map((failure) => `  ${failure}`)
      .join('\n')}\n`
  );
  process.exit(1);
}

console.log(`PASS releaseDays (${checks} checks)`);
