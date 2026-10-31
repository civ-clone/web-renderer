// The progress bar (#742): the stored part, the striped part for next turn or the red part for a shortfall, no more
//  than the capacity, a tick every 10 (or more for a large capacity), decorative unless it's labelled.

// Must stay first: modules read `document` as they load.
import './lib/dom';

import progressBar from '../../src/js/UI/components/lib/ProgressBar';

const failures: string[] = [];
let checks = 0;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${description}
    expected: ${JSON.stringify(expected)}
    actual:   ${JSON.stringify(actual)}`
    );
  }
};

const widths = (bar: HTMLElement) => {
  const [fill, next] = Array.from(bar.children) as HTMLElement[];

  return {
    fill: fill.style.width,
    next: next.style.width,
    loss: next.classList.contains('loss'),
    tick: bar.style.getPropertyValue('--tick'),
  };
};

expect(
  'stored, then next turn striped',
  widths(progressBar({ group: 'Food', stored: 20, capacity: 40, perTurn: 4 })),
  { fill: '50%', next: '10%', loss: false, tick: '25%' }
);
expect(
  "next turn's part stops at the end",
  widths(progressBar({ group: 'Food', stored: 38, capacity: 40, perTurn: 4 }))
    .next,
  '5%'
);
expect(
  'a shortfall is taken off the stored part, in red',
  widths(progressBar({ group: 'Food', stored: 20, capacity: 40, perTurn: -4 })),
  { fill: '40%', next: '10%', loss: true, tick: '25%' }
);
expect(
  'a large capacity ticks every 20',
  widths(
    progressBar({ group: 'Production', stored: 0, capacity: 400, perTurn: 0 })
  ).tick,
  '5%'
);
expect(
  'its colour comes from its yield',
  progressBar({ group: 'Research', stored: 1, capacity: 2, perTurn: 0 }).dataset
    .yield,
  'Research'
);

{
  const decorative = progressBar({
      group: 'Food',
      stored: 1,
      capacity: 2,
      perTurn: 0,
    }),
    labelled = progressBar({
      group: 'Research',
      stored: 12,
      capacity: 60,
      perTurn: 6,
      label: '12 / 60 (6 / turn)',
    });

  expect(
    'without a label it is decorative',
    [decorative.getAttribute('aria-hidden'), decorative.getAttribute('role')],
    ['true', null]
  );
  expect(
    'with one, a progress bar that says its figures',
    [
      labelled.getAttribute('role'),
      labelled.getAttribute('aria-label'),
      labelled.getAttribute('aria-valuenow'),
      labelled.getAttribute('aria-valuemax'),
      labelled.getAttribute('aria-hidden'),
    ],
    ['progressbar', '12 / 60 (6 / turn)', '12', '60', null]
  );
}

expect(
  'a capacity that is no count (nothing chosen) hides it',
  progressBar({
    group: 'Production',
    stored: NaN,
    capacity: Infinity,
    perTurn: 10,
  }).hidden,
  true
);

if (failures.length) {
  process.stderr.write(
    `FAIL progressBar\n${failures
      .map((failure) => `  ${failure}`)
      .join('\n')}\n`
  );
  process.exit(1);
}

console.log(`PASS progressBar (${checks} checks)`);
