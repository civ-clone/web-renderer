// A game's set of plugins (#668). How `buildPluginList.js` works a set out from the plugins it names and what they
//  depend on; that civ.one's two sets are Civ1's own plugins, and those with civ1-enhanced, which is every plugin
//  installed; and, through the worker's own receivers as the page drives them, that a game played with civ1 runs none
//  of civ1-enhanced's code, saves which set it was, and loads with it again, while a save that names no set loads as
//  civ1-enhanced, as every save did before there were sets. Each game is a process of its own, as each is a worker:
//  the plugins can't be unloaded.
//
//   --scenario civ1 <file>             start a civ1 game, play two turns, save to <file>, then ask for civ1-enhanced
//   --scenario load <file>             load <file> where civ1-enhanced is the default, and save again
//   --scenario load-without <file>     the same, with the file's set taken out, as a save from before sets
//   --scenario load-unknown <file>     the same, with the file naming a set this build doesn't have
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
import { pluginsFrom } from '@civ-clone/ui-worker-client/Plugins';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as ruleRegistryInstance } from '@civ-clone/core-rule/RuleRegistry';
import { tmpdir } from 'os';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';

const {
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
};

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
  scenarioIndex = process.argv.indexOf('--scenario'),
  scenario = scenarioIndex === -1 ? null : process.argv[scenarioIndex + 1],
  file = scenarioIndex === -1 ? null : process.argv[scenarioIndex + 2];

const play = (name: string, path: string): void => {
  const receivers = new Map<string, (data: any) => void>(),
    sent: { channel: string; data: any }[] = [],
    transport: any = {
      receive: (channel: string, handler: (data: any) => void) => {
        receivers.set(channel, handler);

        return () => {};
      },
      receiveOnce: () => () => {},
      reply: () => {},
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
    report = (written: any, refused: string | null = null): never => {
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

      report(written, loadFailure());

      return;
    }

    const read = JSON.parse(readFileSync(path, 'utf8'));

    if (name === 'load-without') {
      delete read.pluginSet;
    }

    if (name === 'load-unknown') {
      read.pluginSet = 'civ9';
    }

    receivers.get('load')!({ data: JSON.stringify(read) });

    if (!(await until(loadFinished))) {
      throw new Error('the load never finished');
    }

    report(loadFailure() === null ? saved() : null);
  })().catch((error: any): void => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exit(1);
  });
};

if (scenario !== null) {
  if (
    !['civ1', 'load', 'load-without', 'load-unknown'].includes(scenario) ||
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
    installed = Object.keys(pluginSets.loaders).filter(
      (name) => !pluginSets.sets.some(({ rules }) => rules === name)
    ),
    extras = EXTRA_CIVILIZATIONS.map(
      (civilization) =>
        `@civ-clone/base-civilization-${civilization.toLowerCase()}`
    );

  expect(
    'civ.one has civ1 and civ1-enhanced, and plays civ1-enhanced, as are saves from before sets',
    [
      pluginSets.sets.map(({ id }) => id),
      pluginSets.default,
      pluginSets.withoutOne,
    ],
    [['civ1', 'civ1-enhanced'], 'civ1-enhanced', 'civ1-enhanced']
  );
  expect(
    'civ1-enhanced is every plugin installed, as every game was played with before there were sets',
    enhanced.plugins,
    [...installed].sort((a, b) =>
      a.replace('@civ-clone/', '') < b.replace('@civ-clone/', '') ? -1 : 1
    )
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
    'and each set saves the versions of its own plugins, and no others',
    [civ1, enhanced].map(({ plugins, manifest }) => [
      Object.keys(manifest).sort(),
      Object.values(manifest).every((version) => typeof version === 'string'),
    ]),
    [civ1, enhanced].map(({ plugins }) => [[...plugins].sort(), true])
  );

  const directory = mkdtempSync(join(tmpdir(), 'plugin-sets-')),
    path = join(directory, 'civ1.json'),
    run = (name: string): Report => {
      try {
        const output = execFileSync(
          process.execPath,
          [process.argv[1], '--scenario', name, path],
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
    'a save naming a set this build does not have is refused, saying which',
    [unknown.loaded, /civ9/.test(unknown.failed ?? '')],
    [false, true]
  );

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(`FAIL pluginSets\n${failures.join('\n')}\n`);
    process.exit(1);
  }

  process.stdout.write(`PASS pluginSets (${checks} checks)\n`);
  process.exit(0);
}
