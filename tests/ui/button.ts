// The button system's helper (#740): the variant's class, a plain button rather than a form's submit, the key chip
//  drawn by the theme and given to assistive technology as the shortcut, never part of the label.

// Must stay first: modules read `document` as they load.
import './lib/dom';

import button from '../../src/js/UI/lib/button';

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

{
  const plain = button('Change');

  expect('secondary unless said', plain.className, 'btn-secondary');
  expect('a plain button, not a submit', plain.type, 'button');
  expect('the label', plain.textContent, 'Change');
  expect('no shortcut', plain.hasAttribute('aria-keyshortcuts'), false);
  expect('enabled', plain.disabled, false);
  expect('no title', plain.hasAttribute('title'), false);
}

{
  const cancel = button('Cancel', { variant: 'quiet', hotkey: 'Escape' });

  expect('the variant', cancel.className, 'btn-quiet');
  expect('the chip shows Esc', cancel.dataset.hotkey, 'Esc');
  expect('the label is still only the label', cancel.textContent, 'Cancel');
  expect(
    'the key is the shortcut',
    cancel.getAttribute('aria-keyshortcuts'),
    'Escape'
  );
}

{
  expect(
    'a key without a written form shows itself',
    button('Found city', { hotkey: 'B' }).dataset.hotkey,
    'B'
  );
}

{
  const sell = button('Sell', {
    variant: 'danger',
    className: 'sell  extra',
    title: 'Sell the Granary',
    disabled: true,
  });

  expect(
    'extra classes after the variant',
    sell.className,
    'btn-danger sell extra'
  );
  expect('the title', sell.title, 'Sell the Granary');
  expect('disabled', sell.disabled, true);
}

{
  const marked = button('<span class="x">OK</span>', { variant: 'primary' });

  expect(
    'the label is markup, as the translations give it',
    marked.querySelector('.x')?.textContent,
    'OK'
  );
}

if (failures.length) {
  process.stderr.write(
    `FAIL button\n${failures.map((failure) => `  ${failure}`).join('\n')}\n`
  );
  process.exit(1);
}

console.log(`PASS button (${checks} checks)`);
