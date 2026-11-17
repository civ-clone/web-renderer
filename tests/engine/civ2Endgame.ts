// What Civ2's rules show and tell of the barbarians and the endgame (M2e part 1, #1008):
//
//  - the notices `ui-rules-civ2` makes (a barbarian ship sighted, an uprising, one that came to nothing, global warming's
//    warning and a warming, a civil war, a launch), each told only to those who may know of it, and worded in the
//    translations (en, and en-GB where it differs);
//  - the score's hooks: civ2-score's conquest bonus, which reads whether destroyed civilizations come back, its rating
//    and the title it earns, in our own words, and which wording explains each term;
//  - with the civ2 set loaded: the New Game settings it registers, named in our own words with their defaults (the
//    barbarians' activity a choice of five, level 2 to start with; returning civilizations on), a ship's landing told
//    before the game ends for it, and the Launch action's gate.

// Must stay first: seeds `Math.random` before any engine module evaluates.
import './lib/seed';
import '@civ-clone/ui-worker-client/Game';
import { Greek, Roman } from '@civ-clone/civ2-civilization/Civilizations';
import i18next, { t } from 'i18next';
import {
  ruleSetDescription,
  ruleSetName,
} from '@civ-clone/ui-menus/lib/ruleSetControls';
import GameResult from '@civ-clone/core-turn-based-game/GameResult';
import Notification from '@civ-clone/ui-protocol/Notification';
import { NotificationContext } from '@civ-clone/ui-worker-client/Client/notifications/NotificationContext';
import Player from '@civ-clone/core-player/Player';
import addFormatters from '@civ-clone/ui-game/app/i18nFormatters';
import endgameNotices from '@civ-clone/ui-rules-civ2/endgameNotices';
import i18nOptions from '@civ-clone/ui-game/app/i18nOptions';
import pluginSets from '../../src/js/pluginSets';
import { pluginsFrom } from '@civ-clone/ui-worker-client/Plugins';
import { ruleSetsData } from '@civ-clone/ui-worker-client/lib/ruleSets';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as ruleRegistryInstance } from '@civ-clone/core-rule/RuleRegistry';
import { instance as spaceshipRegistryInstance } from '@civ-clone/core-spaceship/SpaceshipRegistry';

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
    process.stderr.write('FAIL civ2Endgame: stopped before the checks ran\n');
    process.exitCode = 1;
  }
});

// A square on a line: its distance from another is the gap between them, and its neighbours the squares either side.
type StubTile = {
  x: number;
  distanceFrom: (other: StubTile) => number;
  getNeighbours: () => StubTile[];
};

const tiles = new Map<number, StubTile>(),
  tile = (x: number): StubTile => {
    if (!tiles.has(x)) {
      tiles.set(x, {
        x,
        distanceFrom: (other: StubTile) => Math.abs(other.x - x),
        getNeighbours: () => [tile(x - 1), tile(x + 1)],
      });
    }

    return tiles.get(x)!;
  },
  // A player as the handlers read one, and as a notice's translation reads one sent (by civilization).
  player = (name: string) => ({
    name,
    civilization: { _: name },
  }),
  us = player('Roman'),
  greeks = player('Greek'),
  stranger = player('Aztec'),
  rebels = player('Babylonian'),
  city = (name: string, owner: object, x: number) => ({
    name,
    player: () => owner,
    tile: () => tile(x),
    destroyed: () => false,
    originalPlayer: { civilization: { _: (owner as any).name } },
  }),
  rome = city('Rome', us, 0),
  athens = city('Athens', greeks, 20),
  unit = (owner: object) => ({ player: () => owner }),
  units = new Map<StubTile, object[]>(),
  seen = new Set<StubTile>(),
  ctx = {
    player: () => us,
    view: {
      owns: (candidate: unknown) => candidate === us,
    },
    hasMet: (other: unknown) => other !== stranger,
    hasSeen: (square: StubTile) => seen.has(square),
    unitsOn: (square: StubTile) => units.get(square) ?? [],
  } as unknown as NotificationContext,
  table = endgameNotices({
    cityRegistry: { entries: () => [rome, athens] } as never,
  }),
  told = (event: string, ...args: any[]): Notification | null => {
    const handlers = table.filter(([name]) => name === event);

    if (handlers.length !== 1) {
      throw new Error(`${handlers.length} handlers for ${event}`);
    }

    return handlers[0]![1](ctx, ...args) as Notification | null;
  },
  // What the page shows of a notice: its title and body, translated.
  words = (notification: Notification | null): string | null =>
    notification === null
      ? null
      : `${t(`${notification.key()}.title`, {
          ...notification.data(),
          ns: 'notification',
        })}: ${t(`${notification.key()}.body`, {
          ...notification.data(),
          ns: 'notification',
          skipOnVariables: false,
        })}`;

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  addFormatters(i18next);
  await import('../ui/lib/strings');

  await import('../../translations/civ1-civilization/en');
  await import('../../translations/civ2-civilization/en');
  await import('../../translations/civ2-barbarians/en');
  await import('../../translations/civ2-city-improvement/en');
  await import('../../translations/civ2-enhanced/en');
  await import('../../translations/civ2-game-end/en');
  await import('../../translations/civ2-player/en');
  await import('../../translations/civ2-score/en');
  await import('../../translations/civ2-spaceship/en');
  await import('../../translations/civ2-enhanced/en-GB');
  await import('../../translations/civ2-game-end/en-GB');
  await import('../../translations/civ2-player/en-GB');
  await import('../../translations/civ2-spaceship/en-GB');

  // A barbarian ship: told only where one of our cities (2 squares) or units (1) sees it.
  units.set(tile(-30), [unit(us)]);

  expect(
    'a barbarian ship is told where one of our cities or units can see it, and not elsewhere, even on a square we know',
    [
      words(told('barbarians:raiders-at-sea', {}, unit({}), tile(2))),
      words(told('barbarians:raiders-at-sea', {}, unit({}), tile(-31))),
      (seen.add(tile(10)), told('barbarians:raiders-at-sea', {}, {}, tile(10))),
      told('barbarians:raiders-at-sea', {}, {}, tile(-33)),
    ],
    [
      'Sails on the horizon: Our lookouts have sighted a barbarian ship close by. Raiders may land soon!',
      'Sails on the horizon: Our lookouts have sighted a barbarian ship close by. Raiders may land soon!',
      null,
      null,
    ]
  );

  // An uprising: near our nearest city within 8, on a square we've seen; told by whether rifles and cannon are about.
  seen.add(tile(5));
  seen.add(tile(19));

  expect(
    'an uprising near one of our cities is told as near it, tribal or armed, even sized by a computer player’s city; not one we haven’t seen or far from us',
    [
      words(told('barbarians:uprising', {}, rome, tile(5), false)),
      words(told('barbarians:uprising', {}, athens, tile(5), true)),
      told('barbarians:uprising', {}, rome, tile(6), false),
      told('barbarians:uprising', {}, athens, tile(19), false),
    ],
    [
      'Barbarian uprising: Tribesmen have taken up arms near Rome!',
      'Armed uprising: Rebels armed with modern weapons have risen near Rome!',
      null,
      null,
    ]
  );

  expect(
    'an uprising drawn for our city that found nowhere to rise is told to us alone (civ2-enhanced)',
    [
      words(told('barbarians:uprising-failed', us, rome)),
      told('barbarians:uprising-failed', greeks, athens),
    ],
    [
      'Unrest fades: Talk of a barbarian rising near Rome has come to nothing.',
      null,
    ]
  );

  expect(
    'global warming is news for everyone: the warning, and a warming with how many of the squares we know it changed',
    [
      words(told('world:global-warming-warning', 12, 9)),
      words(told('world:global-warming', 1, [tile(5), tile(19), tile(77)])),
      words(told('world:global-warming', 2, [tile(5)])),
      words(told('world:global-warming', 3, [tile(77)])),
    ],
    [
      'The climate is changing: Our scientists warn that pollution is heating the world. Unless it is cleaned up, the seas will rise and the land will dry out.',
      'Global warming: The world has grown warmer. Coasts have sunk into swamp and jungle and inland fields have dried out: 2 squares we know have changed.',
      'Global warming: The world has grown warmer. Coasts have sunk into swamp and jungle and inland fields have dried out: one square we know has changed.',
      'Global warming: The world has grown warmer, changing coasts and fields in lands we have yet to see.',
    ]
  );

  expect(
    'a civil war is told to the civilization that split, with how many cities left, and to those who have met it, the rebels named once met',
    [
      words(told('player:civil-war', us, rebels, [rome, athens])),
      words(told('player:civil-war', us, stranger, [rome])),
      words(told('player:civil-war', greeks, rebels, [athens])),
      words(told('player:civil-war', greeks, stranger, [athens])),
      told('player:civil-war', stranger, greeks, [athens]),
      // Rebels not met aren't sent at all, as a player is sent with its civilization.
      Object.keys(told('player:civil-war', us, stranger, [rome])!.data()),
      Object.keys(told('player:civil-war', greeks, stranger, [athens])!.data()),
    ],
    [
      'Civil war!: Our capital has fallen and the empire is torn apart: 2 cities have broken away to join the Babylonians.',
      'Civil war!: Our capital has fallen and the empire is torn apart: a city has broken away under a new flag.',
      'Civil war: With their capital lost, the Greeks have split in civil war, and the Babylonians rise from the ruins.',
      'Civil war: With their capital lost, the Greeks have split in civil war, and a new civilization rises from the ruins.',
      null,
      ['count'],
      ['loser'],
    ]
  );

  expect(
    'a launch is news for everyone, with the year the ship is due, the launcher named once met',
    [
      words(told('player:spaceship:launched', us, 1987)),
      words(told('player:spaceship:launched', greeks, 2003)),
      words(told('player:spaceship:launched', stranger, 2003)),
      Object.keys(told('player:spaceship:launched', stranger, 2003)!.data()),
    ],
    [
      'Launch!: Our spaceship has lifted off for Alpha Centauri, and should arrive in 1987.',
      'Spaceship launched: The Greeks have launched a spaceship for Alpha Centauri, due to arrive in 2003.',
      'Spaceship launched: A civilization we have never met has launched a spaceship for Alpha Centauri, due to arrive in 2003.',
      ['year'],
    ]
  );

  await i18next.changeLanguage('en-GB');

  expect(
    'en-GB says civilisation',
    [
      words(told('player:civil-war', greeks, stranger, [athens])),
      words(told('player:spaceship:launched', stranger, 2003)),
      ruleSetName('civ2-game-end:comebacks'),
      ruleSetName('civ2-enhanced:pollution-score'),
    ],
    [
      'Civil war: With their capital lost, the Greeks have split in civil war, and a new civilisation rises from the ruins.',
      'Spaceship launched: A civilisation we have never met has launched a spaceship for Alpha Centauri, due to arrive in 2003.',
      'Destroyed civilisations can return',
      'Each civilisation’s score pays only for its own pollution',
    ]
  );

  await i18next.changeLanguage('en');

  // The civ2 set, loaded as the worker loads it: its worker rules, its New Game settings and its rules.
  await pluginsFrom(pluginSets)
    .sets.find(({ id }) => id === 'civ2')!
    .load();

  const { civ2Rules } = await import('@civ-clone/ui-rules-civ2');

  expect(
    'the uprising is told by the rule set in place of the shared notice, and every event of these has its handler there',
    [
      civ2Rules.replacesNotices?.includes('barbarians:uprising'),
      [
        'barbarians:raiders-at-sea',
        'barbarians:uprising',
        'barbarians:uprising-failed',
        'world:global-warming-warning',
        'world:global-warming',
        'player:civil-war',
        'player:spaceship:launched',
      ].every((event) =>
        civ2Rules.notifications?.some(([name]) => name === event)
      ),
    ],
    [true, true]
  );

  // The score's hooks.
  const real = (Civilization: any): Player => {
      const created = new Player();

      created.setCivilization(new Civilization());

      return created;
    },
    winner = real(Roman),
    loser = real(Greek),
    playerWorlds = {
      entries: () =>
        [winner, loser].map((owner) => ({
          player: () => owner,
          width: () => 40,
          height: () => 32,
        })),
    } as never,
    conquest = {
      get: () => new GameResult('conquest', winner, 100),
    } as never,
    respawn = ruleRegistryInstance.getById(
      'civ2-game-end:player/defeated/respawn'
    )!,
    bonus = (): number | null =>
      civ2Rules.conquestBonus(
        winner,
        conquest,
        playerWorlds,
        ruleRegistryInstance
      ),
    withRespawn = bonus();

  respawn.disable();

  const withoutRespawn = bonus();

  respawn.enable();

  expect(
    'the conquest bonus is civ2-score’s, and counts a turn before 251 as 250 once destroyed civilizations don’t come back',
    [
      withRespawn,
      withoutRespawn,
      civ2Rules.conquestBonus(
        loser,
        conquest,
        playerWorlds,
        ruleRegistryInstance
      ),
    ],
    // 100 for the opponent, 2 × (570 − the turn), 400 (civ2-score's `conquestBonus`), × 4/5 on a 40 × 32 map, a small
    //  one.
    [
      ((100 + 2 * (570 - 100) + 400) * 4) / 5,
      ((100 + 2 * (570 - 250) + 400) * 4) / 5,
      null,
    ]
  );

  const rated = civ2Rules.rating(1000, 5);

  expect(
    'the rating is civ2-score’s, with the title it earns among our 24, and the game-over window says so',
    [
      rated,
      Array.from({ length: 24 }, (_, index) =>
        i18next.exists(`RatingTitle.civ2-score.${index}`)
      ).every((exists) => exists),
      t('GameOver.rating', {
        context: 'title',
        rating: rated.rating,
        title: t(`RatingTitle.${rated.title}`),
      }),
      civ2Rules.rating(0, 0).title,
    ],
    [
      // 13 × 1000 / 100 on Deity; the largest i − 1 with i² / 3 at most 130.
      { rating: 130, famousLeader: null, title: 'civ2-score.18' },
      true,
      'Sire, your Civilization Rating of 130% ranks you alongside Ashoka the Great.',
      'civ2-score.0',
    ]
  );

  const terms = [
    'citizens',
    'wonders',
    'spaceship',
    'pollution',
    'peace',
    'future-technology',
    'barbarians',
  ];

  expect(
    'each of civ2-score’s terms is explained in Civ2’s numbers, and the barbarian term is named',
    [
      terms.map((term) => civ2Rules.scoreContext?.(term, ruleRegistryInstance)),
      terms.map((term) =>
        i18next.exists(`CivilizationScoreReport.term.${term}.detail_civ2`)
      ),
      t('CivilizationScoreReport.term.barbarians'),
      i18next.exists('CivilizationScoreReport.bonus.detail_civ2'),
      i18next.exists('CivilizationScoreReport.term.pollution.detail_civ2-own'),
    ],
    [terms.map(() => 'civ2'), terms.map(() => true), 'Barbarians', true, true]
  );

  // The New Game settings, as the setup draws them.
  const nodes = (list: any[]): any[] =>
      list.flatMap((node) => [node, ...nodes(node.members ?? [])]),
    described = nodes(ruleSetsData(null).sets),
    activity = described.find(({ id }) => id === 'civ2-barbarians:activity'),
    comebacks = described.find(({ id }) => id === 'civ2-game-end:comebacks');

  expect(
    'the barbarians’ activity is a choice of four levels and a random one, the second level up to start with, each named and described in our own words',
    [
      activity?.kind,
      (activity?.members ?? []).map(({ id }: any) => [
        id,
        ruleSetName(id),
        ruleSetDescription(id) !== '',
      ]),
      ruleSetsData(null).choices.some(
        ({ id }) => id === 'civ2-barbarians:activity'
      ),
      ruleSetName('civ2-barbarians:activity'),
    ],
    [
      'choice',
      [
        ['civ2-barbarians:activity/0', 'Dormant', true],
        ['civ2-barbarians:activity/1', 'Sporadic', true],
        ['civ2-barbarians:activity/2', 'Active', true],
        ['civ2-barbarians:activity/3', 'Fierce', true],
        ['civ2-barbarians:activity/random', 'Random', true],
      ],
      false,
      'Barbarians',
    ]
  );
  expect(
    'and the returning civilizations are on to start with, named and described in our own words',
    [
      comebacks?.state,
      ruleSetName('civ2-game-end:comebacks'),
      ruleSetDescription('civ2-game-end:comebacks') !== '',
    ],
    ['on', 'Destroyed civilizations can return', true]
  );

  // A ship landing is told before the game ends for it: civ2-spaceship's `High` emit, then civ2-game-end's ending.
  const { default: Landed } = await import(
      '@civ-clone/core-spaceship/Rules/Landed'
    ),
    { newSpaceship } = await import(
      '@civ-clone/civ2-spaceship/lib/newSpaceship'
    ),
    heard: string[] = [],
    hear = (event: string) => () => heard.push(event);

  engine.on('player:spaceship:landed', hear('landed'));
  engine.on('game:over', hear('game over'));

  const ship = newSpaceship(winner);

  spaceshipRegistryInstance.register(ship);
  ruleRegistryInstance.process(Landed, ship);

  expect('a ship’s landing is announced before the game ends for it', heard, [
    'landed',
    'game over',
  ]);

  // The Launch action is offered only once the ship can go, and the client's handler launches only then.
  const { handleLaunchSpaceship } = await import(
      '@civ-clone/ui-worker-client/Client/actions/player'
    ),
    { default: LaunchSpaceship } = await import(
      '@civ-clone/base-player-action-launch-spaceship/LaunchSpaceship'
    ),
    empty = newSpaceship(loser),
    patched: string[] = [];

  spaceshipRegistryInstance.register(empty);

  await handleLaunchSpaceship(
    { patches: { player: () => patched.push('player') } } as never,
    {} as never,
    new LaunchSpaceship(loser, empty)
  );

  expect(
    'an empty ship isn’t launchable, isn’t offered Launch, and the handler leaves it on the ground',
    [
      empty.launchable(),
      loser
        .actions()
        .some((action: object) => action instanceof LaunchSpaceship),
      empty.launched(),
      patched,
    ],
    [false, false, false, []]
  );

  finished = true;
};

run().then(
  () => {
    if (failures.length > 0) {
      process.stderr.write(
        `FAIL civ2Endgame (${
          failures.length
        } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
      );
      process.exit(1);
    }

    process.stdout.write(`PASS civ2Endgame (${checks} checks)\n`);
    process.exit(0);
  },
  (error) => {
    process.stderr.write(`FAIL civ2Endgame: ${error?.stack ?? error}\n`);
    process.exit(1);
  }
);
