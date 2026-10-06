// A selection list with one option is chosen for the player without being
// shown (#148), and `SelectionWindow` itself does it, not just the
// `singleChoice` helper (#258): nothing is added to the page, and `selection`
// and `onChoose` follow once the constructor has returned, because `onChoose`
// usually closes the window its caller is still constructing. A list with
// several options, or one that opts out, is shown and nothing is chosen.

// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';

import SelectionWindow from '../../src/js/UI/components/SelectionWindow';

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

const option = (value: string) => ({ label: value, value });

const open = (
  options: { label: string; value: string }[],
  autoChooseSingle?: boolean
) => {
  const parent = document.createElement('div'),
    events: string[] = [];

  document.body.append(parent);

  const window = new SelectionWindow(
    'Choose',
    options,
    (selection) => events.push(`onChoose:${selection}`),
    null,
    {
      parent,
      ...(autoChooseSingle === undefined ? {} : { autoChooseSingle }),
    }
  );

  window.on('selection', ({ detail }) => events.push(`selection:${detail}`));

  return {
    // Copied: `events` goes on filling after this.
    constructed: [...events],
    events,
    parent,
    window,
  };
};

(async () => {
  const single = open([option('FutureTechnology')]);

  expect(
    'one option: nothing is chosen inside the constructor',
    single.constructed,
    []
  );
  expect(
    'one option: nothing is added to the page',
    single.parent.children.length,
    0
  );

  await Promise.resolve();

  expect(
    'one option: it is chosen once the constructor has returned, `selection` then `onChoose`',
    single.events,
    ['selection:FutureTechnology', 'onChoose:FutureTechnology']
  );
  expect(
    'one option: the window says it chose',
    single.window.autoChosen(),
    true
  );
  expect(
    'one option: still nothing on the page',
    single.parent.children.length,
    0
  );

  const several = open([option('Monarchy'), option('Despotism')]);

  await Promise.resolve();

  expect(
    'several options: the dialog is shown',
    several.parent.querySelectorAll('dialog').length,
    1
  );
  expect('several options: nothing is chosen', several.events, []);

  const optedOut = open([option('Capital')], false);

  await Promise.resolve();

  expect(
    'one option, opted out: the dialog is shown',
    optedOut.parent.querySelectorAll('dialog').length,
    1
  );
  expect('one option, opted out: nothing is chosen', optedOut.events, []);
  expect(
    'one option, opted out: the window did not choose',
    optedOut.window.autoChosen(),
    false
  );

  // Keys pressed in a shown list don't reach the page, where the map's key handler would act on them: an arrow key
  //  choosing between "Keep moving" and "Help build Wonder" would otherwise move the Caravan (#57). Every window stops
  //  its keys, as a `TransientElement`.
  const shown = open([option('Move'), option('HelpBuildWonder')]),
    reached: string[] = [],
    listener = (event: Event) => reached.push((event as KeyboardEvent).key);

  // On the window's parent, which anything leaving the window passes on its way to the page.
  shown.parent.addEventListener('keydown', listener);

  ['ArrowDown', 'ArrowUp', 'PageDown', 'x'].forEach((key) =>
    shown.parent
      .querySelector('select')!
      .dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }))
  );

  shown.parent.removeEventListener('keydown', listener);

  expect('keys pressed in a shown list stay in the window', reached, []);

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL selectionWindow (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS selectionWindow (${checks} checks)\n`);
})().catch((error) => {
  process.stderr.write(`FAIL selectionWindow: ${error?.stack ?? error}\n`);
  process.exit(1);
});
