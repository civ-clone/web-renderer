// The interface's look is set on `<html>` for the stylesheet's tokens to follow: Light or Dark from the player's option,
//  nothing for System default so the browser's own setting applies (#706), and the theme from `?theme=` (#736). The
//  option is kept in browser storage, so the choice comes back on the next page load.

// Must stay first: modules read `document` as they load.
import { document } from './lib/dom';

import GameOptionsRegistry, {
  OptionStorage,
} from '../../src/js/UI/GameOptionsRegistry';
import {
  COLOUR_SCHEMES,
  applyColourScheme,
  applyUiTheme,
} from '../../src/js/UI/lib/theme';

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

const root = document.documentElement as unknown as HTMLElement;

expect('the choices', COLOUR_SCHEMES, ['system', 'light', 'dark']);

applyColourScheme('dark', root);
expect('Dark sets data-theme', root.getAttribute('data-theme'), 'dark');

applyColourScheme('light', root);
expect('Light sets data-theme', root.getAttribute('data-theme'), 'light');

applyColourScheme('system', root);
expect(
  'System default leaves it to the browser',
  root.hasAttribute('data-theme'),
  false
);

applyColourScheme('dark', root);
applyColourScheme('sepia', root);
expect(
  'an unknown choice follows the system',
  root.hasAttribute('data-theme'),
  false
);

applyUiTheme(null, root);
expect(
  'with no ?theme=, Civ1 classic needs no attribute',
  root.hasAttribute('data-ui-theme'),
  false
);

applyUiTheme('slate', root);
expect(
  '?theme=slate sets data-ui-theme',
  root.getAttribute('data-ui-theme'),
  'slate'
);

applyUiTheme('nonsense', root);
expect(
  'a name that is not a theme is ignored',
  root.getAttribute('data-ui-theme'),
  'slate'
);

applyUiTheme('civ1-classic', root);
expect(
  '?theme=civ1-classic goes back to the default',
  root.hasAttribute('data-ui-theme'),
  false
);

{
  const items: { [key: string]: string } = {},
    storage = {
      getItem: (key: string) => items[key] ?? null,
      setItem: (key: string, value: string) => {
        items[key] = value;
      },
    } as OptionStorage,
    pageLoad = () => {
      const registry = new GameOptionsRegistry(() => storage);

      registry.defaults({ colourScheme: 'system' });

      return registry;
    };

  expect(
    'System default is the default',
    pageLoad().get('colourScheme'),
    'system'
  );

  pageLoad().set('colourScheme', 'dark');

  const reloaded = pageLoad();

  expect('the choice survives a reload', reloaded.get('colourScheme'), 'dark');

  applyColourScheme('system', root);
  applyColourScheme(reloaded.get('colourScheme'), root);
  expect(
    'and is applied as the page loads',
    root.getAttribute('data-theme'),
    'dark'
  );
}

if (failures.length) {
  process.stderr.write(
    `FAIL colourScheme\n${failures
      .map((failure) => `  ${failure}`)
      .join('\n')}\n`
  );
  process.exit(1);
}

console.log(`PASS colourScheme (${checks} checks)`);
