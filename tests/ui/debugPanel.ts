// The `?debug=1` panel's notices (#344, step 8): the stress harness says whether its windows are on in the
//  notification bar, for 4 seconds, when the panel starts it and each time Alt+Shift+S turns it back on. They used to
//  be sent to the worker as `notification`, which only the worker sends, so they never showed.

// Must stay first: the components read `document` as they load.
import './lib/dom';

import DebugFlags from '../../src/js/UI/debug/DebugFlags';
import DebugPanel from '../../src/js/UI/debug/DebugPanel';
import NotificationBar from '../../src/js/UI/app/NotificationBar';
import Transport from '../../src/js/UI/Transport';

const failures: string[] = [];
let checks = 0,
  finished = false;

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

// A suite that stops before its checks would otherwise pass in silence (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(`FAIL debugPanel: stopped after ${checks} checks\n`);
    process.exitCode = 1;
  }
});

// The memory sampler's and the stress runner's ticks, and the bar's 4 seconds, run only when the test says so.
const intervals: number[] = [],
  timeouts = new Map<number, { handler: () => void; timeout: number }>();
let nextTimeout = 1;

Object.assign(window, {
  setInterval: () => intervals.push(intervals.length + 1),
  clearInterval: () => {},
  setTimeout: (handler: () => void, timeout: number): number => {
    const reference = nextTimeout++;

    timeouts.set(reference, { handler, timeout });

    return reference;
  },
  clearTimeout: (reference: number) => timeouts.delete(reference),
});

const sent: [string, unknown][] = [],
  transport = {
    send: (channel: string, data: unknown) => sent.push([channel, data]),
    receive: () => () => {},
    receiveOnce: () => {},
  } as unknown as Transport;

const layer = () => ({ isVisible: () => true, setVisible: () => {} }),
  notificationArea = document.createElement('div'),
  notificationBar = new NotificationBar(notificationArea);

// linkedom's `innerText` has no setter, which the bar uses to empty itself.
Object.defineProperty(notificationArea, 'innerText', {
  get(this: HTMLElement): string {
    return this.textContent ?? '';
  },
  set(this: HTMLElement, value: string): void {
    this.textContent = value;
  },
});

document.body.append(notificationArea);

// The test DOM's `KeyboardEvent` takes only `key` and `location`: the rest is set on the event.
const altShift = (key: string): void => {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key,
  });

  Object.defineProperties(event, {
    altKey: { value: true },
    shiftKey: { value: true },
  });

  document.dispatchEvent(event);
};

const notificationsSent = (): unknown[] =>
  sent.filter(([channel]) => channel === 'notification');

// `?debug=1`: the stress runner starts with the panel, its windows off.
const flags = new DebugFlags(true),
  panel = new DebugPanel(flags, {
    citiesMap: layer() as any,
    cityNamesMap: layer() as any,
    currentObjectCount: () => 0,
    currentTurn: () => 1,
    data: () => ({} as any),
    minimap: { update: () => {} } as any,
    notificationBar,
    portal: { render: () => {} } as any,
    setActiveUnit: () => {},
    tilesPendingRender: () => 0,
    transport,
    unitsMap: layer() as any,
    yieldsMap: layer() as any,
  });

expect('the stress runner starts with the panel', !!flags.uiStressRunner, true);
expect(
  "the bar says the stress harness's windows are off",
  notificationArea.innerHTML,
  'Stress harness: windows disabled'
);
expect(
  'for 4 seconds',
  [...timeouts.values()].map(({ timeout }) => timeout),
  [4000]
);
expect(
  'nothing is sent to the worker as a notification',
  notificationsSent(),
  []
);

// Its 4 seconds run out.
[...timeouts.values()].forEach(({ handler }) => handler());
timeouts.clear();

expect('the bar empties after 4 seconds', notificationArea.innerText, '');

// Alt+Shift+S stops it, Alt+Shift+W turns its windows on, Alt+Shift+S starts it again.
altShift('S');

expect('Alt+Shift+S stops the stress runner', flags.uiStressRunner, null);

altShift('W');
altShift('S');

expect('Alt+Shift+S starts it again', !!flags.uiStressRunner, true);
expect(
  'and the bar says its windows are on',
  notificationArea.innerHTML,
  'Stress harness: windows enabled'
);
expect(
  'still nothing is sent to the worker as a notification',
  notificationsSent(),
  []
);

panel.dispose();

expect('dispose stops the stress runner', flags.uiStressRunner, null);

finished = true;

if (failures.length > 0) {
  process.stderr.write(
    `FAIL debugPanel: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS debugPanel: ${checks} checks\n`);
