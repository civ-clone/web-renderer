// The stat pill (#742): the value in bold, the detail after it coloured by its tone, a name for a screen reader, and a
//  button when it opens something. Everything in it is text, not markup.

// Must stay first: modules read `document` as they load.
import './lib/dom';

import statPill from '../../src/js/UI/components/lib/StatPill';

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

{
  const icon = document.createElement('span'),
    pill = statPill({
      className: 'gold',
      label: 'Treasury',
      value: '<b>120</b>',
      detail: '-3 / turn',
      tone: 'negative',
      before: [icon],
    });

  icon.className = 'yield-icon';

  expect(
    'its parts, set as text',
    [
      pill.tagName,
      pill.querySelector('.visually-hidden')?.textContent,
      pill.querySelector('.value')?.textContent,
      pill.querySelector('.value b'),
      pill.querySelector('.detail')?.textContent,
      pill.getAttribute('title'),
    ],
    ['DIV', 'Treasury: ', '<b>120</b>', null, '-3 / turn', 'Treasury']
  );
  expect(
    'the icon comes before the value',
    pill.querySelector('.yield-amount')?.firstElementChild === icon,
    true
  );
  expect(
    'its tone and name are classes',
    pill.className,
    'stat-pill gold negative'
  );
}

{
  let clicked = 0;

  const pill = statPill({
    className: 'government',
    label: 'Government',
    value: 'Monarchy',
    onClick: () => clicked++,
  });

  (pill as HTMLButtonElement).click();

  expect(
    'one that opens something is a bare button, with no tone',
    [pill.tagName, (pill as HTMLButtonElement).type, pill.className, clicked],
    ['BUTTON', 'button', 'btn-bare stat-pill government', 1]
  );
  expect(
    'and no detail is an empty one',
    pill.querySelector('.detail')?.textContent,
    ''
  );
}

if (failures.length) {
  process.stderr.write(
    `FAIL statPill\n${failures.map((failure) => `  ${failure}`).join('\n')}\n`
  );
  process.exit(1);
}

console.log(`PASS statPill (${checks} checks)`);
