// Units arriving or leaving the 3D map with no move (docs/3d-renderer.md §6.4, §8.2, `fades.ts`), by the clock:
//  - a fade in goes from nothing to solid, and one out from solid to nothing, over its time;
//  - each fade's told over once, when its time's up, or when it's ended or all are;
//  - fades have ids of their own, apart from walks' and battles'.

import Fades, { FADE, fadeAt } from '@civ-clone/ui-map-3d/fades';

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

expect(
  'a fade in goes from nothing to solid over its time, and one out from solid to nothing; before it, as it starts',
  [0, 250, 500, 600].map((now) => [
    fadeAt({ id: 'a', kind: 'in', start: 0, duration: 500 }, now),
    fadeAt({ id: 'b', kind: 'out', start: 0, duration: 500 }, now),
  ]),
  [
    [0, 1],
    [0.5, 0.5],
    [1, 0],
    [1, 0],
  ]
);

{
  const fades = new Fades(),
    coming = fades.add('in', 1000),
    going = fades.add('out', 1000, 200),
    stopped = fades.add('in', 1000),
    sample = (now: number) => {
      const { going: under, ended } = fades.at(now);

      return [under.map(({ id, kind, opacity }) => [id, kind, opacity]), ended];
    };

  fades.end(stopped);

  expect(
    'fades under way, as solid as each is, each told over once its time’s up; one ended is over',
    [
      [coming, going, stopped],
      FADE,
      fades.size(),
      sample(1100),
      sample(1250),
      sample(1500),
      sample(1600),
      fades.size(),
    ],
    [
      ['fade-1', 'fade-2', 'fade-3'],
      500,
      2,
      [
        [
          ['fade-1', 'in', 0.2],
          ['fade-2', 'out', 0.5],
        ],
        [],
      ],
      [[['fade-1', 'in', 0.5]], ['fade-2']],
      [[], ['fade-1']],
      [[], []],
      0,
    ]
  );

  fades.add('out', 2000);
  fades.add('in', 2000);

  expect(
    'every fade over at once: their ids, and none left',
    [fades.endAll(), fades.size(), fades.at(2100)],
    [['fade-4', 'fade-5'], 0, { going: [], ended: [] }]
  );
}

if (failures.length > 0) {
  process.stderr.write(
    `FAIL fades: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS fades (${checks} checks)\n`);
