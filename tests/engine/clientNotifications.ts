// The notices the client sends the player (#449), checked with plain data: every key the notification tables in
//  `src/js/Engine/Client/notifications/` can make, what each says, who is told and who isn't, that each key has a
//  title and a body in the translations, and that the registrar listens for each event once, in the order the client
//  used to, and sends what a handler makes and nothing for `null`.

import {
  Advance as AdvanceHut,
  City as CityHut,
  Gold as GoldHut,
  Unit as UnitHut,
} from '@civ-clone/civ1-goody-hut/GoodyHuts';
import {
  Bomber,
  Fighter,
  Nuclear,
  Settlers,
  Trireme,
} from '@civ-clone/civ1-unit/Units';
import {
  NotificationContext,
  NotificationTable,
} from '../../src/js/Engine/Client/notifications/NotificationContext';
import {
  notificationTables,
  registerNotifications,
  registrationOrder,
} from '../../src/js/Engine/Client/notifications/registerNotifications';
import { Anarchy } from '@civ-clone/civ1-government/Governments';
import { Barracks } from '@civ-clone/civ1-city-improvement/CityImprovements';
import CityImprovement from '@civ-clone/core-city-improvement/CityImprovement';
import Part from '@civ-clone/core-spaceship/Part';
import Player from '@civ-clone/core-player/Player';
import Unit from '@civ-clone/core-unit/Unit';
import Notification from '../../src/js/Engine/Notification';
import { stubView } from './lib/view';
import { Pyramids } from '@civ-clone/civ1-wonder/Wonders';
import { Structural } from '@civ-clone/civ1-spaceship/Parts';
import { buildingCompleteKind } from '../../src/js/Engine/Client/notifications/city';
import cityNotifications from '../../src/js/Engine/Client/notifications/city';
import diplomatNotifications, {
  sabotagedBuildKind,
} from '../../src/js/Engine/Client/notifications/diplomat';
import i18next from 'i18next';
import playerNotifications from '../../src/js/Engine/Client/notifications/player';
import unitNotifications from '../../src/js/Engine/Client/notifications/unit';

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
      'FAIL clientNotifications: stopped before the checks ran\n'
    );
    process.exitCode = 1;
  }
});

// Each object is a name, and whatever the handlers read of it.
const named = <T = any>(
    name: string,
    properties: Record<string, unknown> = {},
    prototype: object = Object.prototype
  ): T =>
    Object.create(
      prototype,
      Object.fromEntries(
        Object.entries({ name, ...properties }).map(([key, value]) => [
          key,
          { value },
        ])
      )
    ),
  us = named('us'),
  rival = named('rival'),
  other = named('other'),
  ourCity = named('Rome', { player: () => us, tile: () => 'Rome tile' }),
  rivalCity = named('Babylon', {
    player: () => rival,
    tile: () => 'Babylon tile',
  }),
  unitOf = (player: unknown, prototype: object = Settlers.prototype) =>
    named(
      `${(prototype.constructor as Function).name} of ${player}`,
      {
        player: () => player,
        sourceClass: () => prototype.constructor,
      },
      prototype
    ),
  // Plain values as they are, objects by name, and `{ _ }` stand-ins as they are.
  describeValue = (value: any): unknown =>
    value === null || typeof value !== 'object'
      ? value
      : typeof value.name === 'string'
      ? value.name
      : '_' in value
      ? { _: value._ }
      : Array.isArray(value)
      ? value.map(describeValue)
      : '?',
  describe = (notification: Notification | null) =>
    notification === null
      ? null
      : [
          notification.key(),
          notification.bubble(),
          Object.fromEntries(
            Object.entries(notification.data()).map(([key, value]) => [
              key,
              describeValue(value),
            ])
          ),
        ],
  keysMade = new Set<string>();

Object.defineProperty(us, 'toString', { value: () => 'us' });
Object.defineProperty(rival, 'toString', { value: () => 'rival' });

// The context the client gives the handlers, as plain data.
type World = {
  met: unknown[];
  seen: unknown[];
  unitsOn: Record<string, unknown[]>;
  government: unknown;
};

const contextOf = ({
    met = [],
    seen = [],
    unitsOn = {},
    government = Anarchy,
  }: Partial<World> = {}): NotificationContext =>
    ({
      player: () => us,
      view: stubView(() => us as unknown as Player),
      hasMet: (player: unknown) => met.includes(player),
      hasSeen: (tile: unknown) => seen.includes(tile),
      unitsOn: (tile: string) => unitsOn[tile] ?? [],
      government: () => ({
        is: (Government: unknown) => Government === government,
      }),
    } as unknown as NotificationContext),
  handlerOf = (table: NotificationTable, event: string) => {
    const entries = table.filter(([tableEvent]) => tableEvent === event);

    if (entries.length !== 1) {
      throw new TypeError(`${entries.length} handlers for '${event}'.`);
    }

    return entries[0][1];
  },
  // What `event`'s handler in `table` makes of `args`, described.
  told =
    (table: NotificationTable) =>
    (event: string, args: unknown[], world: Partial<World> = {}) => {
      const notification = handlerOf(table, event)(contextOf(world), ...args);

      if (notification !== null) {
        keysMade.add(notification.key());
      }

      return describe(notification);
    },
  city = told(cityNotifications),
  unit = told(unitNotifications),
  diplomat = told(diplomatNotifications),
  player = told(playerNotifications);

(async () => {
  // city

  expect('a city we capture', city('city:captured', [ourCity, us, rival]), [
    'City.captured-by-us',
    false,
    { city: 'Rome', capturingPlayer: 'us', originalPlayer: 'rival' },
  ]);
  expect(
    'a city captured from us is its news, not this',
    city('city:captured', [rivalCity, rival, us]),
    null
  );
  expect(
    "a rival's capture of another's city",
    city('city:captured', [rivalCity, rival, other]),
    null
  );
  // Taken from ourselves, which only the guard on whose it was keeps quiet (#503).
  expect(
    'a city of ours captured by us',
    city('city:captured', [ourCity, us, us]),
    null
  );

  expect('pollution near our city', city('city:polluted', [ourCity]), [
    'City.polluted',
    false,
    { city: 'Rome' },
  ]);
  expect(
    "pollution near a rival's city",
    city('city:polluted', [rivalCity]),
    null
  );

  expect(
    'SDI protects our city',
    city('city:sdi-protected', [ourCity, unitOf(rival)]),
    ['City.sdi-protected', false, { city: 'Rome' }]
  );
  expect(
    "SDI stops our missile at a rival's city",
    city('city:sdi-protected', [rivalCity, unitOf(us)]),
    ['City.sdi-protected', false, { city: 'Babylon' }]
  );
  expect(
    'SDI between rivals',
    city('city:sdi-protected', [rivalCity, unitOf(other)]),
    null
  );

  const barracks = named('Barracks', {}, Barracks.prototype);

  expect(
    'our city cannot support an improvement',
    city('city:unsupported-improvement', [ourCity, barracks]),
    [
      'City.improvement-unsupported',
      false,
      { city: 'Rome', cityImprovement: 'Barracks' },
    ]
  );
  expect(
    "a rival's city cannot support an improvement",
    city('city:unsupported-improvement', [rivalCity, barracks]),
    null
  );

  const buildOf = (buildCity: unknown) =>
      named('build', { city: () => buildCity }),
    pyramids = named('Pyramids', {}, Pyramids.prototype),
    builds: [string, unknown][] = [
      ['unit', unitOf(us)],
      ['wonder', pyramids],
      ['city-improvement', barracks],
      ['spaceship-part', named('Structural', {}, Structural.prototype)],
      ['other', named('Coinage')],
    ];

  builds.forEach(([kind, build]) => {
    expect(
      `our city builds a ${kind}`,
      city('city:building-complete', [buildOf(ourCity), build]),
      [
        `City.building-complete.${kind}`,
        false,
        { cityBuild: 'build', build: (build as { name: string }).name },
      ]
    );
    expect(`the kind of ${kind}`, buildingCompleteKind(build), kind);
  });

  expect(
    "a rival's wonder in a city we have seen",
    city('city:building-complete', [buildOf(rivalCity), pyramids], {
      seen: ['Babylon tile'],
    }),
    [
      'Wonder.building-complete.other-player.known',
      false,
      { city: 'Babylon', build: 'Pyramids' },
    ]
  );
  expect(
    "a rival's wonder in a city we have not seen",
    city('city:building-complete', [buildOf(rivalCity), pyramids]),
    [
      'Wonder.building-complete.other-player.unknown',
      false,
      { build: 'Pyramids' },
    ]
  );
  expect(
    "a rival's build that is not a wonder",
    builds
      .filter(([kind]) => kind !== 'wonder')
      .map(([, build]) =>
        city('city:building-complete', [buildOf(rivalCity), build], {
          seen: ['Babylon tile'],
        })
      ),
    [null, null, null, null]
  );

  expect(
    'a wonder of ours obsolete',
    city('wonder:obsolete', [pyramids, ourCity]),
    ['Wonder.obsolete', true, { city: 'Rome', wonder: 'Pyramids' }]
  );
  expect(
    "a rival's wonder obsolete",
    city('wonder:obsolete', [pyramids, rivalCity]),
    null
  );

  const gunpowder = named('Gunpowder');

  expect(
    'an improvement obsolete for us, with none to remove',
    city('city-improvement:obsolete', [us, gunpowder, Barracks, []]),
    [
      'CityImprovement.obsolete',
      true,
      { advance: 'Gunpowder', improvement: 'Barracks' },
    ]
  );
  expect(
    'an improvement obsolete for a rival',
    city('city-improvement:obsolete', [rival, gunpowder, Barracks, []]),
    null
  );

  [
    ['city:civil-disorder', 'City.civil-disorder'],
    ['city:order-restored', 'City.order-restored'],
    ['city:leader-celebration', 'City.leader-celebration'],
    ['city:leader-celebration-ended', 'City.leader-celebration-ended'],
  ].forEach(([event, key]) => {
    expect(`${event} in our city`, city(event, [ourCity]), [
      key,
      false,
      { city: 'Rome' },
    ]);
    expect(`${event} in a rival's city`, city(event, [rivalCity]), null);
  });

  // unit

  expect(
    "a rival's nuclear attack",
    unit('unit:nuclear-detonation', [unitOf(rival, Nuclear.prototype), 'tile']),
    ['Unit.nuclear-attack', false, { player: 'rival' }]
  );
  expect(
    'our own nuclear attack',
    unit('unit:nuclear-detonation', [unitOf(us, Nuclear.prototype), 'tile']),
    null
  );

  expect(
    'our ship lost at sea',
    unit('unit:lost-at-sea', [unitOf(us, Trireme.prototype)]),
    ['Unit.lost-at-sea', false, { unit: 'Trireme of us' }]
  );
  [Bomber, Fighter, Nuclear].forEach((UnitType) =>
    expect(
      `our ${UnitType.name} out of fuel`,
      unit('unit:lost-at-sea', [unitOf(us, UnitType.prototype)]),
      ['Unit.out-of-fuel', false, { unit: `${UnitType.name} of us` }]
    )
  );
  expect(
    "a rival's unit lost",
    unit('unit:lost-at-sea', [unitOf(rival, Trireme.prototype)]),
    null
  );

  expect(
    'our city cannot support a unit',
    unit('unit:unsupported', [ourCity, unitOf(us)]),
    ['City.unit-unsupported', false, { city: 'Rome', unit: 'Settlers of us' }]
  );
  expect(
    "a rival's city cannot support a unit",
    unit('unit:unsupported', [rivalCity, unitOf(rival)]),
    null
  );

  expect(
    'our trade route',
    unit('unit:trade-route-established', [us, ourCity, rivalCity, 'Silk', 80]),
    [
      'Unit.trade-route-established',
      false,
      { bonus: 80, city: 'Babylon', goods: 'Silk', home: 'Rome' },
    ]
  );
  expect(
    "a rival's trade route",
    unit('unit:trade-route-established', [
      rival,
      rivalCity,
      ourCity,
      'Silk',
      80,
    ]),
    null
  );

  const hut = named('hut', { tile: () => 'hut tile' });

  [AdvanceHut, CityHut, GoldHut, UnitHut].forEach((Action) => {
    const action = named(Action.name, {}, Action.prototype);

    expect(
      `our unit finds a hut: ${Action.name}`,
      unit('goody-hut:action-performed', [hut, action], {
        unitsOn: { 'hut tile': [unitOf(rival), unitOf(us)] },
      }),
      [
        `GoodyHut.action-performed.${Action.name}`,
        false,
        { goodyHut: 'hut', action: Action.name },
      ]
    );
  });
  expect(
    "a rival's unit finds a hut",
    unit(
      'goody-hut:action-performed',
      [hut, named('Gold', {}, GoldHut.prototype)],
      {
        unitsOn: { 'hut tile': [unitOf(rival)] },
      }
    ),
    null
  );

  // diplomat

  const bronze = named('BronzeWorking');

  expect(
    'an advance stolen from us',
    diplomat('player:advance-stolen', [rival, us, bronze]),
    [
      'Diplomat.advance-stolen',
      false,
      { advance: 'BronzeWorking', thief: 'rival' },
    ]
  );
  expect(
    'an advance we steal',
    diplomat('player:advance-stolen', [us, rival, bronze]),
    [
      'Diplomat.advance-stolen',
      false,
      { advance: 'BronzeWorking', thief: 'us' },
    ]
  );
  expect(
    'an advance stolen between rivals',
    diplomat('player:advance-stolen', [rival, other, bronze]),
    null
  );

  expect(
    'an improvement of ours sabotaged',
    diplomat('city:sabotaged', [
      ourCity,
      rival,
      Object.create(CityImprovement.prototype, {
        sourceClass: { value: () => Barracks },
      }),
    ]),
    [
      'Diplomat.sabotaged.improvement',
      false,
      { city: 'Rome', improvement: 'Barracks' },
    ]
  );

  [
    ['.unit', Settlers],
    ['.wonder', Pyramids],
    ['.city-improvement', Barracks],
    ['.spaceship-part', Structural],
  ].forEach(([suffix, BuildType]) =>
    expect(
      `production of a ${suffix} we sabotage`,
      diplomat('city:sabotaged', [rivalCity, us, BuildType]),
      [
        `Diplomat.sabotaged.production${suffix}`,
        false,
        { city: 'Babylon', build: { _: (BuildType as Function).name } },
      ]
    )
  );
  // What a sabotaged city was building, as the kind its name is translated under (#503): a class of a unit, a wonder (a
  //  `CityImprovement` too, so it is asked about first), an improvement or a spaceship part, and nothing for anything
  //  else, the classes those are made from and an instance included.
  expect(
    'the kind of build sabotaged',
    [
      Settlers,
      Pyramids,
      Barracks,
      Structural,
      Unit,
      CityImprovement,
      Part,
      Object.create(Settlers.prototype),
      'Settlers',
      null,
      undefined,
    ].map((target) => sabotagedBuildKind(target)),
    [
      '.unit',
      '.wonder',
      '.city-improvement',
      '.spaceship-part',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ]
  );
  expect(
    'production of nothing sabotaged',
    diplomat('city:sabotaged', [ourCity, rival, null]),
    ['Diplomat.sabotaged.production', false, { city: 'Rome', build: { _: '' } }]
  );
  expect(
    'sabotage between rivals',
    diplomat('city:sabotaged', [rivalCity, other, Settlers]),
    null
  );

  expect('our city incited', diplomat('city:incited', [ourCity, rival, us]), [
    'Diplomat.incited',
    false,
    { city: 'Rome', inciter: 'rival', originalPlayer: 'us' },
  ]);
  expect('a city we incite', diplomat('city:incited', [rivalCity, us, rival]), [
    'Diplomat.incited',
    false,
    { city: 'Babylon', inciter: 'us', originalPlayer: 'rival' },
  ]);
  expect(
    'incitement between rivals',
    diplomat('city:incited', [rivalCity, other, rival]),
    null
  );

  expect(
    'our unit bribed',
    diplomat('unit:bribed', [unitOf(rival), rival, us]),
    [
      'Diplomat.unit-bribed',
      false,
      { briber: 'rival', previousOwner: 'us', unit: 'Settlers' },
    ]
  );
  expect(
    'a unit we bribe',
    diplomat('unit:bribed', [unitOf(us), us, rival]),
    null
  );

  // player

  class FutureTechnology {}

  const future = named('FutureTechnology', {
      sourceClass: () => FutureTechnology,
    }),
    researchOf = (researcher: unknown) =>
      named('research', {
        player: () => researcher,
        complete: () => [
          new FutureTechnology(),
          named('Alphabet'),
          new FutureTechnology(),
        ],
      });

  expect(
    'our research complete, numbered',
    player('player:research-complete', [researchOf(us), future]),
    [
      'Player.research-complete',
      false,
      { playerResearch: 'research', advance: 'FutureTechnology', number: 2 },
    ]
  );
  expect(
    "a rival's research complete",
    player('player:research-complete', [researchOf(rival), future]),
    null
  );

  expect('retirement draws near', player('game:retirement-warning', []), [
    'Game.retirement-warning',
    false,
    { player: 'us' },
  ]);

  expect(
    'our own defeat is the ending, not a notice',
    player('player:defeated', [us, rival], { met: [rival] }),
    null
  );
  expect(
    'a civilization we met defeated by one we met',
    player('player:defeated', [rival, other], { met: [rival, other] }),
    ['Player.defeated.by', false, { defeatedPlayer: 'rival', player: 'other' }]
  );
  expect(
    'a civilization we met defeated by one we have not',
    player('player:defeated', [rival, other], { met: [rival] }),
    [
      'Player.defeated.unknown',
      false,
      { defeatedPlayer: 'rival', player: null },
    ]
  );
  expect(
    'a civilization we met defeated by no one',
    player('player:defeated', [rival, null], { met: [rival] }),
    [
      'Player.defeated.unknown',
      false,
      { defeatedPlayer: 'rival', player: null },
    ]
  );
  expect(
    'a civilization we have not met defeated by one we met',
    player('player:defeated', [rival, other], { met: [other] }),
    ['Player.defeated.unmet-by', false, { player: 'other' }]
  );
  expect(
    'a civilization we have not met defeated by one we have not',
    player('player:defeated', [rival, other]),
    ['Player.defeated.unmet', false, { player: null }]
  );

  expect(
    'our government collapses into Anarchy',
    player('player:government:collapsed', [us, ourCity]),
    ['Player.government-collapsed', false, { city: 'Rome' }]
  );
  expect(
    'our government collapses with the Pyramids',
    player('player:government:collapsed', [us, ourCity], {
      government: null,
    }),
    ['Player.government-collapsed.pyramids', false, { city: 'Rome' }]
  );
  expect(
    "a rival's government collapses",
    player('player:government:collapsed', [rival, rivalCity]),
    null
  );

  expect(
    'a civilization we met comes back',
    player('player:respawned', [other, rival], { met: [rival] }),
    ['Player.respawned', true, { defeatedPlayer: 'rival' }]
  );
  expect(
    'a civilization we had not met comes back',
    player('player:respawned', [other, rival]),
    ['Player.respawned.unmet', true, {}]
  );

  expect(
    'a part of a spaceship we know of',
    player('player:spaceship:part-built', [rival], { met: [rival] }),
    ['Spaceship.part-built', false, { player: 'rival' }]
  );
  expect(
    'a part of a spaceship we do not know of',
    player('player:spaceship:part-built', [rival]),
    ['Spaceship.part-built.unmet', false, {}]
  );
  expect(
    'a part of our own spaceship',
    player('player:spaceship:part-built', [us]),
    null
  );

  expect(
    'our spaceship in flight lost',
    player('player:spaceship:lost', [us, true]),
    ['Spaceship.returned', false, { player: 'us' }]
  );
  expect(
    'a spaceship being built by a civilization we met, cancelled',
    player('player:spaceship:lost', [rival, false], { met: [rival] }),
    ['Spaceship.cancelled', false, { player: 'rival' }]
  );
  expect(
    'a spaceship of a civilization we have not met, lost',
    player('player:spaceship:lost', [rival, true]),
    null
  );

  expect('our spaceship lands', player('player:spaceship:landed', [us]), [
    'Player.spaceship-landed',
    false,
    { player: 'us' },
  ]);
  expect(
    "a rival's spaceship lands",
    player('player:spaceship:landed', [rival]),
    null
  );

  const peace = named('Peace', { players: () => [us, rival] });

  expect(
    'our declaration expired',
    player('player:declaration-expired', [us, peace]),
    [
      'Player.declaration-expired',
      false,
      { player: 'us', declaration: 'Peace', enemy: 'rival' },
    ]
  );
  expect(
    "a rival's declaration expired",
    player('player:declaration-expired', [rival, peace]),
    null
  );
  expect(
    'our declaration broken by the rival',
    player('player:declaration-expired', [us, peace, rival]),
    [
      'Player.declaration-expired',
      false,
      { player: 'us', declaration: 'Peace', enemy: 'rival' },
    ]
  );
  expect(
    'our declaration broken by us (#641)',
    player('player:declaration-expired', [us, peace, us]),
    [
      'Player.declaration-broken',
      false,
      { player: 'us', declaration: 'Peace', enemy: 'rival' },
    ]
  );

  // Every key the tables can make was made above.

  const everyKey = [
    'City.building-complete.city-improvement',
    'City.building-complete.other',
    'City.building-complete.spaceship-part',
    'City.building-complete.unit',
    'City.building-complete.wonder',
    'City.captured-by-us',
    'City.civil-disorder',
    'City.improvement-unsupported',
    'City.leader-celebration',
    'City.leader-celebration-ended',
    'City.order-restored',
    'City.polluted',
    'City.sdi-protected',
    'City.unit-unsupported',
    'CityImprovement.obsolete',
    'Diplomat.advance-stolen',
    'Diplomat.incited',
    'Diplomat.sabotaged.improvement',
    'Diplomat.sabotaged.production',
    'Diplomat.sabotaged.production.city-improvement',
    'Diplomat.sabotaged.production.spaceship-part',
    'Diplomat.sabotaged.production.unit',
    'Diplomat.sabotaged.production.wonder',
    'Diplomat.unit-bribed',
    'Game.retirement-warning',
    'GoodyHut.action-performed.Advance',
    'GoodyHut.action-performed.City',
    'GoodyHut.action-performed.Gold',
    'GoodyHut.action-performed.Unit',
    'Player.declaration-broken',
    'Player.declaration-expired',
    'Player.defeated.by',
    'Player.defeated.unknown',
    'Player.defeated.unmet',
    'Player.defeated.unmet-by',
    'Player.government-collapsed',
    'Player.government-collapsed.pyramids',
    'Player.research-complete',
    'Player.respawned',
    'Player.respawned.unmet',
    'Player.spaceship-landed',
    'Spaceship.cancelled',
    'Spaceship.part-built',
    'Spaceship.part-built.unmet',
    'Spaceship.returned',
    'Unit.lost-at-sea',
    'Unit.nuclear-attack',
    'Unit.out-of-fuel',
    'Unit.trade-route-established',
    'Wonder.building-complete.other-player.known',
    'Wonder.building-complete.other-player.unknown',
    'Wonder.obsolete',
  ];

  expect('every key is made', [...keysMade].sort(), everyKey);

  // Each has a title and a body in the translations, as the notice window reads them.

  await i18next.init({ lng: 'en', defaultNS: 'default', ns: ['default'] });

  // Every translation file there is for `en`, as the app loads them.
  await import('../../translations/local/en');
  await import('../../translations/civ1-city/en');
  await import('../../translations/civ1-city-improvement/en');
  await import('../../translations/civ1-civilization/en');
  await import('../../translations/civ1-difficulty/en');
  await import('../../translations/civ1-diplomacy/en');
  await import('../../translations/civ1-government/en');
  await import('../../translations/civ1-science/en');
  await import('../../translations/civ1-spaceship/en');
  await import('../../translations/civ1-trade-rate/en');
  await import('../../translations/civ1-unit/en');
  await import('../../translations/civ1-wonder/en');
  await import('../../translations/civ1-world/en');

  expect(
    'every key has a title and a body',
    everyKey.flatMap((key) =>
      ['title', 'body']
        .filter(
          (part) => !i18next.exists(`${key}.${part}`, { ns: 'notification' })
        )
        .map((part) => `${key}.${part}`)
    ),
    []
  );

  // registerNotifications

  const tableEvents = notificationTables.flat().map(([event]) => event);

  expect(
    'each event is in one table, once',
    tableEvents.filter((event, i) => tableEvents.indexOf(event) !== i),
    []
  );
  expect(
    'and in the registration order, which has nothing else',
    [...tableEvents].sort(),
    [...registrationOrder].sort()
  );

  const listening: [string, (...args: any[]) => void][] = [],
    engine = {
      on: (event: string, listener: (...args: any[]) => void) =>
        listening.push([event, listener]),
      off: (event: string, listener: (...args: any[]) => void) =>
        listening.splice(
          listening.findIndex(
            ([listeningEvent, listeningListener]) =>
              listeningEvent === event && listeningListener === listener
          ),
          1
        ),
    },
    emit = (event: string, ...args: unknown[]) =>
      listening
        .filter(([listeningEvent]) => listeningEvent === event)
        .forEach(([, listener]) => listener(...args)),
    notified: unknown[] = [],
    dispose = registerNotifications(engine as any, {
      ...contextOf(),
      notifier: {
        notify: (notification: Notification) =>
          notified.push(describe(notification)),
      },
    });

  // As a list of its own, so that two swapped in `registrationOrder` are told (#503).
  expect(
    'one listener per event, in the order the client registered them',
    listening.map(([event]) => event),
    [
      'city:captured',
      'unit:nuclear-detonation',
      'city:polluted',
      'city:sdi-protected',
      'unit:lost-at-sea',
      'unit:unsupported',
      'city:unsupported-improvement',
      'unit:trade-route-established',
      'player:advance-stolen',
      'city:sabotaged',
      'city:incited',
      'unit:bribed',
      'city:building-complete',
      'player:research-complete',
      'wonder:obsolete',
      'city-improvement:obsolete',
      'goody-hut:action-performed',
      'game:retirement-warning',
      'player:defeated',
      'city:civil-disorder',
      'city:order-restored',
      'player:government:collapsed',
      'city:leader-celebration',
      'city:leader-celebration-ended',
      'player:respawned',
      'player:spaceship:part-built',
      'player:spaceship:lost',
      'player:spaceship:landed',
      'player:declaration-expired',
      'barbarians:landed',
      'barbarians:uprising',
    ]
  );

  emit('city:polluted', ourCity);
  emit('city:polluted', rivalCity);
  emit('game:retirement-warning');

  expect('a notice is sent for each handler that makes one', notified, [
    ['City.polluted', false, { city: 'Rome' }],
    ['Game.retirement-warning', false, { player: 'us' }],
  ]);

  dispose();

  expect('disposing stops every listener', listening, []);

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL clientNotifications (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS clientNotifications (${checks} checks)\n`);
})().catch((error) => {
  process.stderr.write(`FAIL clientNotifications: ${error.stack ?? error}\n`);
  process.exit(1);
});
