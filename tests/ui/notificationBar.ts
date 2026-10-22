// The worker's `notification` messages are shown as text, not markup (#469): a loaded save's name and the reason a
//  save couldn't be loaded reach the bar, so a save holding `<img onerror>` would otherwise run script on the page.

// Must stay first: the components read `document` as they load.
import { document } from './lib/dom';

import NotificationBar from '../../src/js/UI/app/NotificationBar';
import Transport from '../../src/js/UI/Transport';

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

const area = document.createElement('div'),
  bar = new NotificationBar(area),
  listeners: { [name: string]: (data: any) => void } = {};

document.body.append(area);

bar.listen({
  receive: (name: string, listener: (data: any) => void) => {
    listeners[name] = listener;

    return () => {};
  },
} as unknown as Transport);

// As `Game.load` sends it when a save names a plugin that isn't loaded.
const message =
  'could not load: Save needs plugins that are not loaded: <img src=x onerror=alert(document.domain)>';

listeners.notification(message);

expect('the message is shown as it was sent', area.textContent, message);
expect('and creates no element', area.children.length, 0);

bar.show("loaded '<b>Rome</b>'");

expect(
  'a notice shown directly is text too',
  [area.textContent, area.children.length],
  ["loaded '<b>Rome</b>'", 0]
);

if (failures.length) {
  console.error(`FAIL notification-bar\n  ${failures.join('\n  ')}`);

  process.exit(1);
}

console.log(`PASS notification-bar (${checks} checks)`);

// The bar's 4-second timer would keep node waiting.
process.exit(0);
