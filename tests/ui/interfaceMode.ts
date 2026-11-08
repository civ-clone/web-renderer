// The interface flag (#735): modern unless the `interface` option or the visit's `?interface=` says classic, a value that
//  isn't an interface ignored, and the one in use said on `<html>`.

// Must stay first: modules read `document` as they load.
import { document } from './lib/dom';
import './lib/interfaces';

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

expect('modern before anything says otherwise', interfaceMode(), 'modern');
expect(
  'the option says modern',
  [applyInterface(null, 'modern', root), root.getAttribute('data-interface')],
  ['modern', 'modern']
);
expect(
  'the visit says classic, over the option',
  [applyInterface('classic', 'modern', root), interfaceMode()],
  ['classic', 'classic']
);
expect(
  'the visit says modern',
  [applyInterface('modern', 'classic', root), interfaceMode()],
  ['modern', 'modern']
);
expect(
  'a value that is no interface is ignored, for the option',
  applyInterface('fancy', 'classic', root),
  'classic'
);
expect(
  'and with neither, modern',
  [applyInterface('fancy', 'fancy', root), root.getAttribute('data-interface')],
  ['modern', 'modern']
);
expect(
  'a choice kept from before modern was named, or an old link, finds it',
  [applyInterface(null, 'new', root), applyInterface('new', 'classic', root)],
  ['modern', 'modern']
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
