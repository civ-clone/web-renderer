// The interface flag (#735): classic unless the `interface` option or the visit's `?interface=` says new, a value that
//  isn't an interface ignored, and the one in use said on `<html>`.

// Must stay first: modules read `document` as they load.
import { document } from './lib/dom';

import interfaceMode, {
  applyInterface,
} from '../../src/js/UI/lib/interfaceMode';

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

const root = (document as unknown as Document).documentElement;

expect('classic before anything says otherwise', interfaceMode(), 'classic');
expect(
  'the option says new',
  [applyInterface(null, 'new', root), root.getAttribute('data-interface')],
  ['new', 'new']
);
expect(
  'the visit says classic, over the option',
  [applyInterface('classic', 'new', root), interfaceMode()],
  ['classic', 'classic']
);
expect(
  'the visit says new',
  [applyInterface('new', 'classic', root), interfaceMode()],
  ['new', 'new']
);
expect(
  'a value that is no interface is ignored, for the option',
  applyInterface('fancy', 'new', root),
  'new'
);
expect(
  'and with neither, classic',
  [applyInterface('fancy', 'fancy', root), root.getAttribute('data-interface')],
  ['classic', 'classic']
);

if (failures.length) {
  process.stderr.write(
    `FAIL interfaceMode\n${failures
      .map((failure) => `  ${failure}`)
      .join('\n')}\n`
  );
  process.exit(1);
}

console.log(`PASS interfaceMode (${checks} checks)`);
