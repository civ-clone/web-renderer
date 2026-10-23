// The client's city news and notifications (#400, #420, #449), checked with plain data and a stub transport: what each
//  city's news in one engine call says, and which outcome wins when several happened; that the news of one engine call
//  goes out once it is over, one notice per city, and news heard while it is told is told next; and that notifications
//  go through the filter, are held while the hold says so, and are sent in order when released.

import CityNewsCollector, {
  CityNews,
  cityNewsNotifications,
} from '../../src/js/Engine/Client/cityNews';
import City from '@civ-clone/core-city/City';
import { DataFilter } from '../../src/js/Engine/Client/visibilityFilter';
import Notification from '../../src/js/Engine/Notification';
import Notifier from '../../src/js/Engine/Client/Notifier';
import Player from '@civ-clone/core-player/Player';
import { standalone } from '../../src/js/Engine/Client/refs';

const failures: string[] = [];
let checks = 0,
  finished = false;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  const [a, e] = [actual, expected].map((value) => JSON.stringify(value));

  if (a !== e) {
    failures.push(`${description}\n    expected: ${e}\n    actual:   ${a}`);
  }
};

// A run that stops before it reports has checked nothing (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      'FAIL clientCityNews: stopped before the checks ran\n'
    );
    process.exitCode = 1;
  }
});

// Only who they are is read, so a name each is enough.
const us = { name: 'us' } as unknown as Player,
  rival = { name: 'rival' } as unknown as Player,
  other = { name: 'other' } as unknown as Player,
  city = (name: string) => ({ name } as unknown as City),
  news = (overrides: Partial<CityNews>): CityNews => ({
    ours: true,
    capturedBy: null,
    capturedFrom: null,
    destroyed: false,
    destroyedBy: null,
    famine: false,
    ...overrides,
  }),
  // A notification as a list: its key, whether it is a bubble, and its data with each object named.
  describe = (notification: Notification) => [
    notification.key(),
    notification.bubble(),
    Object.fromEntries(
      Object.entries(notification.data()).map(([key, value]) => [
        key,
        (value as { name: string } | null)?.name ?? null,
      ])
    ),
  ],
  outcome = (entry: CityNews, player: Player = us) =>
    cityNewsNotifications([[city('Rome'), entry]], player).map(describe),
  tick = () => new Promise((resolve) => setTimeout(resolve, 0));

(async () => {
  // cityNewsNotifications

  expect(
    'a city captured from us',
    outcome(news({ capturedBy: rival, capturedFrom: us })),
    [
      [
        'City.captured-from-us',
        true,
        { city: 'Rome', capturingPlayer: 'rival', originalPlayer: 'us' },
      ],
    ]
  );

  expect(
    'a city captured from us and destroyed by the capture',
    outcome(
      news({
        capturedBy: rival,
        capturedFrom: us,
        destroyed: true,
        destroyedBy: other,
      })
    ),
    [['City.destroyed-by', true, { city: 'Rome', player: 'rival' }]]
  );

  expect(
    'a city of ours destroyed by a player',
    outcome(news({ destroyed: true, destroyedBy: rival })),
    [['City.destroyed-by', true, { city: 'Rome', player: 'rival' }]]
  );

  expect(
    'a city of ours destroyed by no one',
    outcome(news({ destroyed: true })),
    [['City.destroyed', true, { city: 'Rome' }]]
  );

  expect('a city of ours starving', outcome(news({ famine: true })), [
    ['City.food-storage-exhausted', false, { city: 'Rome' }],
  ]);

  expect(
    'a city of ours starving and captured: the capture is told',
    outcome(news({ famine: true, capturedBy: rival, capturedFrom: us })),
    [
      [
        'City.captured-from-us',
        true,
        { city: 'Rome', capturingPlayer: 'rival', originalPlayer: 'us' },
      ],
    ]
  );

  expect(
    'a city of ours starving and destroyed: the destruction is told',
    outcome(news({ famine: true, destroyed: true })),
    [['City.destroyed', true, { city: 'Rome' }]]
  );

  expect('a city of ours with nothing to tell', outcome(news({})), []);

  expect(
    "a rival's city starving, destroyed or captured tells us nothing",
    [
      news({ ours: false, famine: true }),
      news({ ours: false, destroyed: true, destroyedBy: rival }),
      news({ ours: false, capturedBy: rival, capturedFrom: other }),
    ].map((entry) => outcome(entry)),
    [[], [], []]
  );

  expect(
    'the news is told for whose it is',
    outcome(news({ ours: false, capturedBy: us, capturedFrom: rival }), rival),
    [
      [
        'City.captured-from-us',
        true,
        { city: 'Rome', capturingPlayer: 'us', originalPlayer: 'rival' },
      ],
    ]
  );

  expect(
    'several cities are told in order',
    cityNewsNotifications(
      [
        [city('Rome'), news({ famine: true })],
        [city('Veii'), news({ ours: false, famine: true })],
        [city('Antium'), news({ destroyed: true })],
      ],
      us
    ).map(describe),
    [
      ['City.food-storage-exhausted', false, { city: 'Rome' }],
      ['City.destroyed', true, { city: 'Antium' }],
    ]
  );

  // CityNewsCollector

  const told: unknown[] = [],
    rome = { name: 'Rome', player: () => us } as unknown as City,
    veii = { name: 'Veii', player: () => rival } as unknown as City,
    antium = { name: 'Antium', player: () => us } as unknown as City,
    collector = new CityNewsCollector(
      () => us,
      (notification) => told.push(describe(notification))
    );

  // One engine call: Rome starves and is captured, Veii (a rival's) starves, Antium starves.
  collector.of(rome).famine = true;
  Object.assign(collector.of(rome), { capturedBy: rival, capturedFrom: us });
  collector.of(veii).famine = true;
  collector.of(antium).famine = true;

  expect('nothing is told while the engine call is under way', told, []);

  await Promise.resolve();

  expect('once it is over, one notice per city, in the order heard of', told, [
    [
      'City.captured-from-us',
      true,
      { city: 'Rome', capturingPlayer: 'rival', originalPlayer: 'us' },
    ],
    ['City.food-storage-exhausted', false, { city: 'Antium' }],
  ]);

  told.splice(0);

  await tick();

  expect('and nothing more after it', told, []);

  collector.of(antium).destroyed = true;

  await Promise.resolve();

  expect('the next engine call is news afresh', told, [
    ['City.destroyed', true, { city: 'Antium' }],
  ]);

  told.splice(0);

  // News heard while the last is told, as when telling it makes something else happen (#503): it is told next, not
  //  dropped with what was told.
  let reentered = false;

  const reentrant = new CityNewsCollector(
    () => us,
    (notification) => {
      told.push(describe(notification));

      if (!reentered) {
        reentered = true;
        reentrant.of(antium).destroyed = true;
      }
    }
  );

  reentrant.of(rome).famine = true;

  await tick();

  expect('news heard while news is told is told after it', told, [
    ['City.food-storage-exhausted', false, { city: 'Rome' }],
    ['City.destroyed', true, { city: 'Antium' }],
  ]);

  // Notifier

  const sent: [string, unknown][] = [],
    transport = {
      send: (channel: string, data: unknown) => sent.push([channel, data]),
    },
    localFilters: unknown[] = [],
    // Everything here is plain already, but for a secret, which the filter stands in for.
    dataFilter = ((localFilter: unknown) => {
      localFilters.push(localFilter);

      return (object: any) =>
        object?.secret === true ? { standIn: true } : object;
    }) as unknown as DataFilter,
    notifier = new Notifier(transport as any, dataFilter),
    keyOf = ([channel, payload]: [string, any]) => [
      channel,
      payload instanceof Notification,
      payload.objects[payload.hierarchy['#ref']].key,
    ];

  let held = false;

  const first = new Notification('First', {});

  notifier.notify(first);

  expect('with no hold, a notification is sent at once', sent.map(keyOf), [
    ['gameNotification', false, 'First'],
  ]);
  expect(
    'as the plain object it serialises to',
    sent[0][1],
    first.toPlainObject()
  );
  expect(
    'filtered to stand-alone references',
    localFilters.map((filter) => filter === standalone),
    [true]
  );

  sent.splice(0);

  notifier.notify(new Notification('Secret', { who: { secret: true } }));

  const [[, secret]] = sent as [string, any][];

  expect(
    "what a notification refers to goes as the filter's stand-in",
    secret.objects[secret.hierarchy['#ref']].data,
    { who: { standIn: true } }
  );

  sent.splice(0);

  notifier.holdWhile(() => held);
  notifier.notify(new Notification('Second', {}));

  expect('a hold that says no holds nothing', sent.map(keyOf), [
    ['gameNotification', false, 'Second'],
  ]);

  sent.splice(0);
  held = true;

  notifier.notify(new Notification('Third', {}));
  notifier.notify(new Notification('Fourth', {}));

  expect('while held, nothing is sent', sent, []);

  held = false;

  expect('nor when the hold ends, before the release', sent, []);

  notifier.release();

  expect('a release sends what was held, in order', sent.map(keyOf), [
    ['gameNotification', false, 'Third'],
    ['gameNotification', false, 'Fourth'],
  ]);

  sent.splice(0);
  notifier.release();

  expect('and only once', sent, []);

  notifier.notify(new Notification('Fifth', {}));

  expect('after it, a notification is sent at once', sent.map(keyOf), [
    ['gameNotification', false, 'Fifth'],
  ]);

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL clientCityNews (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS clientCityNews (${checks} checks)\n`);
})();
