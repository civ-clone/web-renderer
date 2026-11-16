// A game's set of plugins (#668). How `buildPluginList.js` works a set out from the plugins it names and what they
//  depend on; that civ.one's three sets are Civ1's own plugins, those with civ1-enhanced, which is every plugin
//  installed but Civ2's (its own plugins and the traits only its units use), and Civ2's (hidden, and sharing no
//  Civ1 plugin: `civ2Isolation.ts` checks what it loads);
//  and, through the worker's own receivers as the page drives them, that a game played with civ1 runs none of
//  civ1-enhanced's code, saves which set it was, and loads with it again, while a save that names no set loads as
//  civ1-enhanced, as every save did before there were sets. Each game is a process of its own, as each is a worker:
//  the plugins can't be unloaded.
//
//   --scenario civ1 <file>             start a civ1 game, play two turns, save to <file>, then ask for civ1-enhanced
//   --scenario load <file>             load <file> where civ1-enhanced is the default, and save again
//   --scenario load-without <file>     the same, with the file's set taken out, as a save from before sets
//   --scenario load-unknown <file>     the same, with the file naming a set this build doesn't have
//   --scenario civ2 <file>             ask which sets there are (#668), with and without Civ2's art, choose civ2, start
//                                      a game on the isometric grid, play two turns and save to <file>
//   --scenario load-civ2 <file>        load <file> where civ1-enhanced is the default, and save again
//
// Imports `src/js/pluginSets.ts`, never `src/js/plugins.ts`, which would run every plugin in the default set.

// Must stay first: seeds `Math.random` before any engine module evaluates.
import './lib/seed';
import './lib/spawnedClients';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import Game from '@civ-clone/ui-worker-client/Game';
import { defaultGame } from '@civ-clone/core-game/defaultGame';
import { execFileSync } from 'child_process';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { join } from 'path';
import pluginSets from '../../src/js/pluginSets';
import {
  isOffered,
  offeredSets,
  pluginsFrom,
} from '@civ-clone/ui-worker-client/Plugins';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as ruleRegistryInstance } from '@civ-clone/core-rule/RuleRegistry';
import { tmpdir } from 'os';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';
import {
  Alliance,
  Ceasefire,
} from '@civ-clone/library-diplomacy/Declarations';
import {
  AskAlly,
  CancelAlliance,
  DemandWithdrawal,
  Gift,
  JoinWar,
  OfferCeasefire,
  ProposeAlliance,
  SellAdvance,
  ShareMaps,
} from '@civ-clone/library-diplomacy/Proposals';
import BorderRecord from '@civ-clone/civ2-diplomacy/Records/BorderRecord';
import CallForHelpRecord from '@civ-clone/civ2-diplomacy/Records/CallForHelpRecord';
import { Gold } from '@civ-clone/library-city/Yields';
import { IInteraction } from '@civ-clone/core-diplomacy/Interaction';
import LastContactRecord from '@civ-clone/base-diplomacy/Records/LastContactRecord';
import Negotiation from '@civ-clone/core-diplomacy/Negotiation';
import PatienceRecord from '@civ-clone/base-diplomacy/Records/PatienceRecord';
import SenateRecord from '@civ-clone/civ2-diplomacy/Records/SenateRecord';
import TreatyFlagsRecord from '@civ-clone/civ2-diplomacy/Records/TreatyFlagsRecord';
import WarnedUnitsRecord from '@civ-clone/civ2-diplomacy/Records/WarnedUnitsRecord';
import { instance as interactionRegistryInstance } from '@civ-clone/core-diplomacy/InteractionRegistry';
import isBarbarian from '@civ-clone/base-civilization-barbarian/isBarbarian';
import { instance as playerResearchRegistryInstance } from '@civ-clone/core-science/PlayerResearchRegistry';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';

const {
  defaultSetProblems,
  followedDependencies,
  resolvePluginSets,
} = require('../../tools/lib/pluginSets');

type Report = {
  loaded: boolean;
  failed: string | null;
  set: string | null;
  manifest: string[];
  civilizations: string[];
  enhancedRules: number;
  ruleSets: string[];
  // What asking for another set, once one is loaded, was answered.
  refused: string | null;
  // And asking for a hidden one (civ2).
  refusedHidden: string | null;
  // Rule ids of Civ1's own packages registered (civ2 must have none).
  civ1Rules: number;
  // The saved world's grid.
  topologyId: string | null;
  // What the page's requests were answered (#668), where the scenario asks them.
  protocol: { [request: string]: unknown } | null;
  // Every type of entity in the save.
  types: string[];
};

// What a Civ2 game's diplomacy can hold that its save has to name (M2d, #1007): the ceasefire and alliance, base-
//  diplomacy's records, civ2-diplomacy's, and every proposal of the talks a person opens, with each kind of gift.
const CIV2_DIPLOMACY_TYPES = [
  'Alliance',
  'AskAlly',
  'BorderRecord',
  'CallForHelpRecord',
  'CancelAlliance',
  'Ceasefire',
  'DemandWithdrawal',
  'Gift',
  'Gold',
  'JoinWar',
  'LastContactRecord',
  'OfferCeasefire',
  'PatienceRecord',
  'ProposeAlliance',
  'SellAdvance',
  'SenateRecord',
  'ShareMaps',
  'TreatyFlagsRecord',
  'WarnedUnitsRecord',
];

const EXTRA_CIVILIZATIONS = [
    'Australian',
    'Brazilian',
    'Chukchi',
    'Ethiopian',
    'Inca',
    'Indonesian',
    'Japanese',
    'Khmer',
    'Kongo',
    'Malian',
    'Sioux',
    'Viking',
  ],
  // Shared unit traits only Civ2's units declare so far. Each package's `main` is its trait class, so they count as
  //  plugins, and only civ2 reaches them.
  CIV2_ONLY_TRAITS = [
    'amphibious',
    'covert',
    'defence-bonus-vs-air',
    'defence-bonus-vs-mounted',
    'detects-submerged',
    'paradrop',
    'single-use',
    'support-exempt-under',
    'terrain-as-road',
  ].map((trait) => `@civ-clone/base-unit-trait-${trait}`),
  scenarioIndex = process.argv.indexOf('--scenario'),
  scenario = scenarioIndex === -1 ? null : process.argv[scenarioIndex + 1],
  file = scenarioIndex === -1 ? null : process.argv[scenarioIndex + 2];

// Registers one of each of `CIV2_DIPLOMACY_TYPES` between the first two players, in a negotiation where it's a proposal.
const civ2DiplomacyRecords = (): void => {
  const [player, other, third] = playerRegistryInstance
      .entries()
      .filter((candidate) => !isBarbarian(candidate)),
    rules = ruleRegistryInstance,
    negotiation = new Negotiation(player, other, rules),
    unit = unitRegistryInstance.getByPlayer(player)[0],
    advance = playerResearchRegistryInstance.getByPlayer(player).complete()[0],
    proposals = [
      new AskAlly(player, negotiation, rules),
      new CancelAlliance(player, negotiation, rules),
      new DemandWithdrawal(player, negotiation, rules),
      new Gift(new Gold(25), player, negotiation, rules),
      new Gift(unit, player, negotiation, rules),
      new Gift(advance, player, negotiation, rules),
      new JoinWar(third, player, negotiation, rules),
      new OfferCeasefire(other, negotiation, rules),
      new ProposeAlliance(player, negotiation, rules),
      new SellAdvance(advance, new Gold(30), other, negotiation, rules),
      new ShareMaps(player, negotiation, rules),
    ];

  // As the talks hold them, without running their rules.
  (negotiation as unknown as { _interactions: unknown[] })._interactions.push(
    ...proposals
  );

  interactionRegistryInstance.register(
    negotiation as IInteraction,
    new Ceasefire(player, other, rules) as IInteraction,
    new Alliance(player, other, rules) as IInteraction,
    new PatienceRecord(player, other, 2, rules) as IInteraction,
    new LastContactRecord(player, other, 1, rules) as IInteraction,
    new TreatyFlagsRecord(player, other, 0x1, rules) as IInteraction,
    new SenateRecord(player, 42, true, rules) as IInteraction,
    new CallForHelpRecord(player, other, third, rules) as IInteraction,
    new BorderRecord(player, other, ['a'], rules) as IInteraction,
    new WarnedUnitsRecord(player, [unit.id()], rules) as IInteraction
  );
};

const play = (name: string, path: string): void => {
  const receivers = new Map<string, (data: any, meta?: any) => void>(),
    sent: { channel: string; data: any }[] = [],
    replies: { channel: string; data: any; id: number }[] = [],
    transport: any = {
      receive: (channel: string, handler: (data: any) => void) => {
        receivers.set(channel, handler);

        return () => {};
      },
      receiveOnce: () => () => {},
      reply: (channel: string, data: any, id: number) => {
        replies.push({ channel, data, id });
      },
      request: () => new Promise(() => {}),
      send: (channel: string, data: any) => {
        sent.push({ channel, data });
      },
    },
    until = async (done: () => boolean, tries = 3000): Promise<boolean> => {
      for (let i = 0; i < tries; i++) {
        if (done()) {
          return true;
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      return false;
    },
    // The file the worker writes for the page's Save.
    saved = (): any => {
      receivers.get('save')!({ name: 'plugin sets' });

      const message = [...sent]
        .reverse()
        .find(({ channel }) => channel === 'saveGame');

      return message ? JSON.parse(message.data.data) : null;
    },
    loadFinished = (): boolean =>
      sent.some(
        ({ channel, data }) =>
          channel === 'loadFailed' ||
          (channel === 'notification' &&
            typeof data === 'string' &&
            data.startsWith('loaded'))
      ),
    loadFailure = (): string | null =>
      sent.find(({ channel }) => channel === 'loadFailed')?.data?.message ??
      null,
    loadFailures = (): string[] =>
      sent
        .filter(({ channel }) => channel === 'loadFailed')
        .map(({ data }) => data?.message ?? ''),
    // A request as the page makes one: answered with a reply carrying its id, or refused with a `requestFailed`.
    ask = async (channel: string, data: unknown): Promise<any> => {
      const id = 1000 + replies.length + sent.length;

      receivers.get(channel)!(data, { id });

      for (let i = 0; i < 3000; i++) {
        const reply = replies.find((candidate) => candidate.id === id),
          failure = sent.find(
            (candidate) =>
              candidate.channel === 'requestFailed' && candidate.data?.id === id
          );

        if (reply) {
          return reply.data;
        }

        if (failure) {
          throw new Error(failure.data.message);
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      throw new Error(`${channel} was never answered`);
    },
    report = (
      written: any,
      refused: string | null = null,
      refusedHidden: string | null = null,
      protocol: { [request: string]: unknown } | null = null
    ): never => {
      process.stdout.write(
        JSON.stringify({
          loaded: written !== null,
          failed: loadFailure(),
          set: written?.pluginSet ?? null,
          manifest: Object.keys(written?.engine?.plugins ?? {}),
          // Those still to be claimed and those the players have, as each player takes one out of the registry. The
          //  barbarians' player is spawned by the rules, and isn't one to choose.
          civilizations: [
            ...new Set([
              ...defaultGame.civilizations
                .entries()
                .map((Civilization) => typeNameOf(Civilization)),
              ...playerRegistryInstance
                .entries()
                .map((player) => player.civilization())
                .filter((civilization) => civilization !== null)
                .map((civilization) =>
                  typeNameOf(civilization!.constructor as any)
                ),
            ]),
          ]
            .filter((civilization) => civilization !== 'Barbarian')
            .sort(),
          enhancedRules: ruleRegistryInstance
            .entries()
            .filter((rule) => (rule.id() ?? '').startsWith('civ1-enhanced'))
            .length,
          ruleSets: defaultGame.ruleSets.describe().map(({ id }) => id),
          refused,
          refusedHidden,
          civ1Rules: ruleRegistryInstance
            .entries()
            .filter((rule) => (rule.id() ?? '').startsWith('civ1-')).length,
          topologyId:
            written?.entities?.find(({ type }: any) => type === 'World')?.state
              ?._topologyId ?? null,
          protocol,
          types: [
            ...new Set<string>(
              (written?.entities ?? []).map(({ type }: any) => type)
            ),
          ].sort(),
        } as Report) + '\n'
      );
      process.exit(0);
    },
    plugins = pluginsFrom(pluginSets);

  let turns = 0;

  engine.on('turn:start', (): void => {
    turns++;
  });

  // Nothing the game throws is the suite's to hear.
  console.error = () => {};
  console.warn = () => {};

  if (name === 'civ1') {
    // Civ1's own plugins, as the page would choose them.
    new Game(transport, { ...plugins, default: 'civ1' });
  } else {
    new Game(transport, plugins);
  }

  (async (): Promise<void> => {
    receivers.get('setOption')!({ name: 'automateLocalPlayer', value: true });

    if (name === 'civ1') {
      Object.entries({
        width: 40,
        height: 25,
        difficulty: 'Chieftain',
        seats: [{ kind: 'human' }, { kind: 'computer' }, { kind: 'computer' }],
      }).forEach(([option, value]) =>
        receivers.get('setOption')!({ name: option, value })
      );

      receivers.get('start')!(null);

      if (!(await until(() => turns >= 2))) {
        throw new Error(
          `the civ1 game never reached its second turn: ${JSON.stringify(
            sent.filter(({ channel }) => channel === 'workerError')
          )}`
        );
      }

      const written = saved();

      writeFileSync(path, JSON.stringify(written));

      // Asking for the other set now: refused, as it can't be loaded on top.
      receivers.get('load')!({
        data: JSON.stringify({ ...written, pluginSet: 'civ1-enhanced' }),
      });

      await until(loadFinished);

      // And for a hidden one: refused too, without naming it.
      receivers.get('load')!({
        data: JSON.stringify({ ...written, pluginSet: 'civ2' }),
      });

      await until(() => loadFailures().length >= 2);

      report(written, loadFailure(), loadFailures()[1] ?? null);

      return;
    }

    if (name === 'civ2') {
      // What the page asks before New Game (#668): which sets, with no art beyond Civ1's and with Civ2's. Neither
      //  loads anything.
      const protocol: { [request: string]: unknown } = {
        withoutArt: await ask('pluginSets', ['civ1']),
        withArt: await ask('pluginSets', ['civ1', 'civ2']),
      };

      protocol.loadedRules = ruleRegistryInstance.entries().length;
      // The game chosen: civ2, loaded, and so what the setup asks next comes from it.
      protocol.chosen = await ask('choosePluginSet', 'civ2');
      protocol.after = await ask('pluginSets', ['civ1', 'civ2']);
      protocol.difficulties = (await ask('difficulties', null)).map(
        ({ name }: { name: string }) => name
      );
      protocol.aiClients = await ask('aiClients', null);

      // Another game now is refused: the page starts another worker for it.
      try {
        await ask('choosePluginSet', 'civ1-enhanced');
        protocol.refusedOther = null;
      } catch (error) {
        protocol.refusedOther = (error as Error).message;
      }

      Object.entries({
        topologyId: 'staggered-iso',
        width: 40,
        height: 32,
        difficulty: 'Chieftain',
        seats: [{ kind: 'human' }, { kind: 'computer' }, { kind: 'computer' }],
      }).forEach(([option, value]) =>
        receivers.get('setOption')!({ name: option, value })
      );

      receivers.get('start')!(null);

      if (!(await until(() => turns >= 2))) {
        throw new Error(
          `the civ2 game never reached its second turn: ${JSON.stringify(
            sent.filter(({ channel }) => channel === 'workerError')
          )}`
        );
      }

      // One of each of the diplomacy's records and proposals, as a game with talks would have them.
      civ2DiplomacyRecords();

      const written = saved();

      writeFileSync(path, JSON.stringify(written));

      report(written, null, null, protocol);

      return;
    }

    if (name === 'civ1-ai') {
      report(null, null, null, { aiClients: await ask('aiClients', null) });

      return;
    }

    const read = JSON.parse(readFileSync(path, 'utf8'));

    if (name === 'load-without') {
      delete read.pluginSet;
    }

    if (name === 'load-unknown') {
      read.pluginSet = 'civ9';
    }

    // Before the load, what a page reloaded to load it asks: which sets there are, which fixes none.
    const before =
      name === 'load-civ2' ? await ask('pluginSets', ['civ1', 'civ2']) : null;

    receivers.get('load')!({ data: JSON.stringify(read) });

    if (!(await until(loadFinished))) {
      throw new Error('the load never finished');
    }

    report(
      loadFailure() === null ? saved() : null,
      null,
      null,
      before === null ? null : { before }
    );
  })().catch((error: any): void => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exit(1);
  });
};

if (scenario !== null) {
  if (
    ![
      'civ1',
      'civ1-ai',
      'load',
      'load-without',
      'load-unknown',
      'civ2',
      'load-civ2',
    ].includes(scenario) ||
    !file
  ) {
    process.stderr.write(`FAIL pluginSets: bad scenario '${scenario}'\n`);
    process.exit(1);
  }

  play(scenario, file);
} else {
  const failures: string[] = [];
  let checks = 0,
    finished = false;

  const expect = (
    description: string,
    actual: unknown,
    expected: unknown
  ): void => {
    checks++;

    const [a, e] = [actual, expected].map((value) => JSON.stringify(value));

    if (a !== e) {
      failures.push(`${description}\n    expected: ${e}\n    actual:   ${a}`);
    }
  };

  // A run that stops before it reports has checked nothing (#473).
  process.on('exit', (code: number): void => {
    if (code === 0 && !finished) {
      process.stderr.write('FAIL pluginSets: stopped before the checks ran\n');
      process.exitCode = 1;
    }
  });

  // How a set is worked out, on plugins made up for it.
  const plugin = (
      name: string,
      dependencies: string[] = [],
      conflicts: string[] = []
    ) => ({ name, dependencies, conflicts }),
    made = [
      plugin('@x/c', ['@x/a', '@x/library', 'not-a-plugin']),
      plugin('@x/a'),
      plugin('@x/b', ['@x/a']),
      plugin('@x/d'),
      plugin('@x/e', [], ['@x/d']),
      plugin('@x/through-library'),
    ],
    libraries = (name: string) =>
      name === '@x/library' ? ['@x/through-library'] : null,
    resolved = resolvePluginSets(
      {
        one: { rules: '@x/rules-one', plugins: ['@x/c'] },
        two: { extends: 'one', plugins: ['@x/b', '@x/d'] },
        three: { extends: 'two', rules: '@x/rules-three', plugins: ['@x/e'] },
      },
      made,
      libraries
    );

  expect(
    'a set is the plugins it names and everything they depend on, through libraries too, in name order, with its own rules or those of the set it extends',
    resolved.sets.map(({ id, plugins, rules }: any) => [id, plugins, rules]),
    [
      ['one', ['@x/a', '@x/c', '@x/through-library'], '@x/rules-one'],
      [
        'two',
        ['@x/a', '@x/b', '@x/c', '@x/d', '@x/through-library'],
        '@x/rules-one',
      ],
      [
        'three',
        ['@x/a', '@x/b', '@x/c', '@x/d', '@x/e', '@x/through-library'],
        '@x/rules-three',
      ],
    ]
  );
  expect(
    'two plugins in one set where one conflicts with the other are a problem',
    resolved.problems,
    ['set three has @x/e, which conflicts with @x/d']
  );
  expect(
    'as are a plugin no set loads, a plugin a set names that is not installed, a set extending one there is not, and a set with no rules',
    resolvePluginSets(
      {
        one: { rules: '@x/rules', plugins: ['@x/a', '@x/missing'] },
        two: { extends: 'none', plugins: [] },
      },
      [plugin('@x/a'), plugin('@x/b')]
    ).problems,
    [
      "set one names @x/missing, which isn't an installed plugin",
      "set two extends none, which there isn't",
      'set two has no worker rules (`rules`)',
      '@x/b is installed, but no set loads it: add it to a set, or to `excludes`',
    ]
  );

  expect(
    'as are a set whose `hidden` is not true or false, and a conflict (`civ-clone.conflicts`) naming something that is not an installed plugin',
    resolvePluginSets(
      {
        one: { rules: '@x/rules', plugins: ['@x/a'], hidden: 'yes' },
        two: { rules: '@x/rules', plugins: ['@x/b'], hidden: false },
      },
      [plugin('@x/a'), plugin('@x/b')],
      () => null,
      { '@x/a': ['@x/b', '@x/typo'], '@x/missing': ['@x/a'] }
    ).problems,
    [
      'set one has `hidden` "yes", which isn\'t true or false',
      "`civ-clone.conflicts` names @x/typo, which isn't an installed plugin",
      "`civ-clone.conflicts` names @x/missing, which isn't an installed plugin",
    ]
  );

  const madeSets = [
    { id: 'shown', plugins: [], rules: '@x/rules', hidden: false },
    { id: 'hidden', plugins: [], rules: '@x/rules', hidden: true },
  ];

  expect(
    'the sets a game gets without asking must be sets, and not hidden ones',
    [
      defaultSetProblems(
        { defaultSet: 'shown', setForSavesWithoutOne: 'shown' },
        madeSets
      ),
      defaultSetProblems(
        { defaultSet: 'hidden', setForSavesWithoutOne: 'none' },
        madeSets
      ),
    ],
    [
      [],
      [
        '`civ-clone.defaultSet`, the set a new game is played with, is "hidden", which is hidden',
        '`civ-clone.setForSavesWithoutOne`, the set a save made before there were sets loads with, is "none", which isn\'t a set',
      ],
    ]
  );

  // A set drawn with an art pack of its own (`tileset`, #668): offered only to a page with that art, and never a set a
  //  game gets without asking.
  expect(
    'a set names its art pack by tileset id, or none; anything else is a problem',
    [
      resolvePluginSets(
        {
          one: { rules: '@x/rules', plugins: ['@x/a'], tileset: 'pack' },
          two: { rules: '@x/rules', plugins: ['@x/b'] },
        },
        [plugin('@x/a'), plugin('@x/b')]
      ).sets.map(({ id, tileset }: any) => [id, tileset]),
      resolvePluginSets(
        { one: { rules: '@x/rules', plugins: ['@x/a'], tileset: 2 } },
        [plugin('@x/a')]
      ).problems,
    ],
    [
      [
        ['one', 'pack'],
        ['two', null],
      ],
      ["set one has `tileset` 2, which isn't a tileset's id"],
    ]
  );
  expect(
    'a set built on one with art of its own must name its art too, however far down, or it is a problem',
    [
      resolvePluginSets(
        {
          art: { rules: '@x/rules', plugins: ['@x/a'], tileset: 'pack' },
          child: { extends: 'art', plugins: ['@x/b'] },
          grandchild: { extends: 'child', plugins: [] },
          named: { extends: 'art', plugins: [], tileset: 'pack' },
        },
        [plugin('@x/a'), plugin('@x/b')]
      ).problems,
    ],
    [
      [
        'set child extends art, which is drawn with the pack art, but names no `tileset` of its own',
        'set grandchild extends art, which is drawn with the pack art, but names no `tileset` of its own',
      ],
    ]
  );
  expect(
    'the sets a game gets without asking need no art of their own',
    defaultSetProblems({ defaultSet: 'art', setForSavesWithoutOne: 'art' }, [
      {
        id: 'art',
        plugins: [],
        rules: '@x/rules',
        hidden: false,
        tileset: 'pack',
      },
    ]),
    [
      '`civ-clone.defaultSet`, the set a new game is played with, is "art", which needs the pack art imported',
      '`civ-clone.setForSavesWithoutOne`, the set a save made before there were sets loads with, is "art", which needs the pack art imported',
    ]
  );
  expect(
    'a set with art of its own is offered once that art is imported, hidden or not; any other unless it is hidden',
    [
      [true, false].flatMap((hidden) =>
        [[], ['pack'], ['other']].map((tilesets) =>
          isOffered({ hidden, tileset: 'pack' }, tilesets)
        )
      ),
      [true, false].map((hidden) =>
        isOffered({ hidden, tileset: null }, ['pack'])
      ),
    ],
    [
      [false, true, false, false, true, false],
      [false, true],
    ]
  );

  // What a package only imports (`civ-clone.importsOnly`) isn't followed from it, but is still loaded when named or
  //  reached another way.
  const importer = (
      name: string,
      dependencies: string[],
      importsOnly: string[]
    ) => ({ ...plugin(name, dependencies), importsOnly }),
    importing = [
      importer('@x/ai', ['@x/shared', '@x/rules-a-unit'], ['@x/rules-a-unit']),
      plugin('@x/shared'),
      plugin('@x/rules-a-unit', ['@x/rules-a-world']),
      plugin('@x/rules-a-world'),
      plugin('@x/through-library'),
      plugin('@x/only-imported-by-library'),
    ],
    importingLibraries = (name: string) =>
      name === '@x/library'
        ? followedDependencies({
            dependencies: ['@x/through-library', '@x/only-imported-by-library'],
            importsOnly: ['@x/only-imported-by-library'],
          })
        : null,
    setsOf = (sets: { [id: string]: { plugins: string[] } }) =>
      resolvePluginSets(
        Object.fromEntries(
          Object.entries(sets).map(([id, set]) => [
            id,
            { rules: '@x/rules', ...set },
          ])
        ),
        [
          ...importing,
          importer('@x/importing-library-user', ['@x/library'], []),
          importer('@x/plain', ['@x/rules-a-unit'], []),
        ],
        importingLibraries
      ).sets.map(({ id, plugins }: any) => [id, plugins]);

  expect(
    'a dependency a plugin only imports is not loaded with it, nor what that dependency depends on',
    setsOf({ b: { plugins: ['@x/ai'] } }),
    [['b', ['@x/ai', '@x/shared']]]
  );
  expect(
    'but it is when the set names it, or another plugin in the set depends on it',
    setsOf({
      a: { plugins: ['@x/ai', '@x/rules-a-unit'] },
      plain: { plugins: ['@x/ai', '@x/plain'] },
    }),
    [
      ['a', ['@x/ai', '@x/rules-a-unit', '@x/rules-a-world', '@x/shared']],
      [
        'plain',
        [
          '@x/ai',
          '@x/plain',
          '@x/rules-a-unit',
          '@x/rules-a-world',
          '@x/shared',
        ],
      ],
    ]
  );
  expect(
    'and a library that only imports a package does not bring it in either',
    setsOf({ library: { plugins: ['@x/importing-library-user'] } }),
    [['library', ['@x/importing-library-user', '@x/through-library']]]
  );
  expect(
    'and a package only some other package imports is still a plugin no set loads',
    resolvePluginSets(
      { b: { rules: '@x/rules', plugins: ['@x/ai'] } },
      importing.slice(0, 3)
    ).problems,
    [
      '@x/rules-a-unit is installed, but no set loads it: add it to a set, or to `excludes`',
    ]
  );

  // civ.one's sets, as `buildPluginList.js` wrote them.
  const civ1 = pluginSets.sets.find(({ id }) => id === 'civ1')!,
    enhanced = pluginSets.sets.find(({ id }) => id === 'civ1-enhanced')!,
    civ2 = pluginSets.sets.find(({ id }) => id === 'civ2')!,
    civ2Enhanced = pluginSets.sets.find(({ id }) => id === 'civ2-enhanced')!,
    installed = Object.keys(pluginSets.loaders).filter(
      (name) => !pluginSets.sets.some(({ rules }) => rules === name)
    ),
    byPackageName = (a: string, b: string): number =>
      a.replace('@civ-clone/', '') < b.replace('@civ-clone/', '') ? -1 : 1,
    extras = EXTRA_CIVILIZATIONS.map(
      (civilization) =>
        `@civ-clone/base-civilization-${civilization.toLowerCase()}`
    ),
    civ2Packages = installed.filter((name) =>
      name.startsWith('@civ-clone/civ2-')
    ),
    civ2Only = [...civ2Packages, ...CIV2_ONLY_TRAITS].sort(byPackageName),
    // civ2-enhanced is the civ2-enhanced set's own, as civ1-enhanced is civ1-enhanced's.
    civ2SetOnly = civ2Only.filter(
      (name) => name !== '@civ-clone/civ2-enhanced'
    ),
    config = require('../../package.json')['civ-clone'];

  expect(
    'civ.one has civ1, civ1-enhanced, civ2 and civ2-enhanced, and plays civ1-enhanced, as are saves from before sets',
    [
      pluginSets.sets.map(({ id }) => id),
      pluginSets.default,
      pluginSets.withoutOne,
    ],
    [
      ['civ1', 'civ1-enhanced', 'civ2', 'civ2-enhanced'],
      'civ1-enhanced',
      'civ1-enhanced',
    ]
  );
  expect(
    'civ2 and civ2-enhanced are hidden, so the page offers only the two Civ1 sets until Civ2’s art can be imported',
    [
      pluginSets.sets.map(({ id, hidden }) => [id, hidden]),
      offeredSets(pluginsFrom(pluginSets)).map(({ id }) => id),
    ],
    [
      [
        ['civ1', false],
        ['civ1-enhanced', false],
        ['civ2', true],
        ['civ2-enhanced', true],
      ],
      ['civ1', 'civ1-enhanced'],
    ]
  );
  expect(
    'and they are drawn with Civ2’s art, so a page that has imported it is offered both Civ2 sets too',
    [
      pluginSets.sets.map(({ id, tileset }) => [id, tileset]),
      offeredSets(pluginsFrom(pluginSets), ['civ1', 'civ2']).map(
        ({ id }) => id
      ),
    ],
    [
      [
        ['civ1', null],
        ['civ1-enhanced', null],
        ['civ2', 'civ2'],
        ['civ2-enhanced', 'civ2'],
      ],
      ['civ1', 'civ1-enhanced', 'civ2', 'civ2-enhanced'],
    ]
  );
  expect(
    'civ1-enhanced is every plugin installed but the civ2 packages and the traits only Civ2 uses, as every game was played with before there were sets',
    enhanced.plugins,
    installed.filter((name) => !civ2Only.includes(name)).sort(byPackageName)
  );
  expect(
    'civ1 is the same but civ1-enhanced, the world civilizations, and their twelve civilizations',
    enhanced.plugins.filter((name) => !civ1.plugins.includes(name)).sort(),
    [
      ...extras,
      '@civ-clone/civ1-enhanced',
      '@civ-clone/civ1-world-civilizations',
    ].sort()
  );
  expect(
    'civ2 has the civ2 plugins and the traits only it uses, and shares the rest with civ1-enhanced: no civ1 plugin and no library aggregate',
    [
      civ2.plugins
        .filter((name) => !enhanced.plugins.includes(name))
        .sort(byPackageName),
      civ2.plugins.filter((name) => /^@civ-clone\/(civ1|library)-/.test(name)),
    ],
    [civ2SetOnly, []]
  );
  expect(
    'civ2-enhanced is civ2 and civ2-enhanced',
    civ2Enhanced.plugins
      .filter((name) => !civ2.plugins.includes(name))
      .concat(civ2.plugins.filter((name) => !civ2Enhanced.plugins.includes(name))),
    ['@civ-clone/civ2-enhanced']
  );
  expect(
    'and neither Civ1 set has a civ2 plugin',
    [civ1, enhanced].map(({ plugins }) =>
      plugins.filter((name) => name.startsWith('@civ-clone/civ2-'))
    ),
    [[], []]
  );
  expect(
    'each civ2 plugin conflicts with its Civ1 twin (`civ-clone.conflicts`), so a set with both is refused',
    resolvePluginSets(
      {
        both: {
          rules: '@x/rules',
          plugins: civ2Packages.flatMap((name) => [
            name,
            name.replace('/civ2-', '/civ1-'),
          ]),
        },
      },
      civ2Packages
        .flatMap((name) => [name, name.replace('/civ2-', '/civ1-')])
        .map((name) => plugin(name)),
      () => null,
      config.conflicts
    ).problems,
    civ2Packages.map(
      (name) =>
        `set both has ${name}, which conflicts with ${name.replace(
          '/civ2-',
          '/civ1-'
        )}`
    )
  );
  expect(
    'and each set saves the versions of its own plugins, and no others',
    [civ1, enhanced, civ2, civ2Enhanced].map(({ plugins, manifest }) => [
      Object.keys(manifest).sort(),
      Object.values(manifest).every((version) => typeof version === 'string'),
    ]),
    [civ1, enhanced, civ2, civ2Enhanced].map(({ plugins }) => [
      [...plugins].sort(),
      true,
    ])
  );

  const directory = mkdtempSync(join(tmpdir(), 'plugin-sets-')),
    path = join(directory, 'civ1.json'),
    run = (name: string, file: string = path): Report => {
      try {
        const output = execFileSync(
          process.execPath,
          [process.argv[1], '--scenario', name, file],
          {
            encoding: 'utf8',
            env: process.env,
            maxBuffer: 256 * 1024 * 1024,
            timeout: 2 * 60 * 1000,
          }
        );

        return JSON.parse(output.trim().split('\n').slice(-1)[0]!);
      } catch (error) {
        process.stderr.write(
          `FAIL pluginSets: ${name} did not report\n${
            (error as any)?.stderr || (error as any)?.message || error
          }\n`
        );
        process.exit(1);
      }
    },
    civ1Game = run('civ1');

  expect(
    'a civ1 game runs none of civ1-enhanced: none of its rules or rule sets, and only the original fourteen civilizations',
    [
      civ1Game.enhancedRules,
      civ1Game.ruleSets,
      civ1Game.civilizations.length,
      civ1Game.civilizations.filter((name) =>
        EXTRA_CIVILIZATIONS.includes(name)
      ),
    ],
    [0, ['civ1-unit:obsolescence'], 14, []]
  );
  expect(
    'its save says it is civ1, and records only civ1’s plugins',
    [civ1Game.set, civ1Game.manifest.sort()],
    ['civ1', [...civ1.plugins].sort()]
  );
  expect(
    'and once it is loaded, civ1-enhanced is refused rather than loaded on top',
    /civ1 rules are loaded here already, and the civ1-enhanced rules can't be loaded on top/.test(
      civ1Game.refused ?? ''
    ),
    true
  );
  expect(
    'as is civ2, which is hidden, so the refusal names it only as other rules',
    [
      /civ1 rules are loaded here already, and the other rules can't be loaded on top/.test(
        civ1Game.refusedHidden ?? ''
      ),
      /civ2/.test(civ1Game.refusedHidden ?? ''),
    ],
    [true, false]
  );

  const loaded = run('load');

  expect(
    'loaded where civ1-enhanced is the default, the save loads with civ1, and saves as civ1 again',
    [
      loaded.failed,
      loaded.set,
      loaded.enhancedRules,
      loaded.ruleSets,
      loaded.civilizations.length,
    ],
    [null, 'civ1', 0, ['civ1-unit:obsolescence'], 14]
  );

  const without = run('load-without');

  expect(
    'a save that names no set loads as civ1-enhanced, as one made before sets did',
    [
      without.failed,
      without.set,
      without.enhancedRules > 0,
      without.ruleSets.includes('civ1-enhanced'),
      without.civilizations.length,
    ],
    [null, 'civ1-enhanced', true, true, 26]
  );

  const unknown = run('load-unknown');

  expect(
    'a save naming a set this build does not have is refused, saying which, and naming only the sets offered (not civ2)',
    [
      unknown.loaded,
      /civ9/.test(unknown.failed ?? ''),
      /civ1, civ1-enhanced\./.test(unknown.failed ?? ''),
      /civ2/.test(unknown.failed ?? ''),
    ],
    [false, true, true, false]
  );

  // Civ2, chosen in New Game (#668): offered only to a page with Civ2's art, played on the isometric grid, saved as
  //  civ2 and loaded as civ2 by a worker whose default is civ1-enhanced.
  const civ2Path = join(directory, 'civ2.json'),
    civ2Game = run('civ2', civ2Path),
    protocol = civ2Game.protocol as any,
    sets = (answer: any): unknown =>
      answer?.sets?.map(({ id, tileset }: any) => [id, tileset]);

  expect(
    'asked which sets there are, the worker offers civ2 only to a page with Civ2’s art, and has loaded none',
    [
      sets(protocol.withoutArt),
      protocol.withoutArt.default,
      protocol.withoutArt.chosen,
      sets(protocol.withArt),
      protocol.withArt.chosen,
    ],
    [
      [
        ['civ1', null],
        ['civ1-enhanced', null],
      ],
      'civ1-enhanced',
      null,
      [
        ['civ1', null],
        ['civ1-enhanced', null],
        ['civ2', 'civ2'],
        ['civ2-enhanced', 'civ2'],
      ],
      null,
    ]
  );
  expect(
    'and asking loads nothing: no rule was registered before civ2 was chosen',
    protocol.loadedRules,
    0
  );
  expect(
    'choosing civ2 loads it, and the setup then gets its six levels',
    [protocol.chosen, protocol.after.chosen, protocol.difficulties],
    [
      'civ2',
      'civ2',
      ['Chieftain', 'Warlord', 'Prince', 'King', 'Emperor', 'Deity'],
    ]
  );
  expect(
    'once civ2 is loaded, another game is refused, for the page to start another worker, without naming civ2',
    [
      /other rules are loaded here already, and the civ1-enhanced rules can't be loaded on top/.test(
        protocol.refusedOther ?? ''
      ),
      /civ2/.test(protocol.refusedOther ?? ''),
    ],
    [true, false]
  );
  expect(
    'a civ2 game on the isometric grid runs no Civ1 rule, and saves as civ2 with only civ2’s plugins',
    [
      civ2Game.failed,
      civ2Game.civ1Rules,
      civ2Game.topologyId,
      civ2Game.set,
      civ2Game.manifest.sort(),
    ],
    [null, 0, 'staggered-iso', 'civ2', [...civ2.plugins].sort()]
  );
  expect(
    'its computer seats are offered the same AI clients as civ1-enhanced’s, which the resume window asks the page’s worker for',
    protocol.aiClients,
    run('civ1-ai').protocol?.aiClients
  );

  const civ2Loaded = run('load-civ2', civ2Path);

  expect(
    'loaded where civ1-enhanced is the default, the civ2 save loads as civ2, with no Civ1 rule, and saves as civ2 again',
    [
      (civ2Loaded.protocol as any)?.before?.chosen,
      civ2Loaded.failed,
      civ2Loaded.set,
      civ2Loaded.civ1Rules,
      civ2Loaded.topologyId,
      civ2Loaded.manifest.sort(),
    ],
    [null, null, 'civ2', 0, 'staggered-iso', [...civ2.plugins].sort()]
  );
  expect(
    'a civ2 game’s ceasefire, alliance, diplomacy records and every proposal of the talks, with a gift of each kind, are saved, loaded and saved again (M2d)',
    [civ2Game.types, civ2Loaded.types].map((types) =>
      CIV2_DIPLOMACY_TYPES.filter((type) => !types.includes(type))
    ),
    [[], []]
  );

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(`FAIL pluginSets\n${failures.join('\n')}\n`);
    process.exit(1);
  }

  process.stdout.write(`PASS pluginSets (${checks} checks)\n`);
  process.exit(0);
}
