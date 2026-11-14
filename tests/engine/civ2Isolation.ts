// The civ2 plugin set loads Civ2's rules and nothing of Civ1's (M2a, civ-clone/web-renderer#1008). Its set is worked
//  out from what its plugins depend on, and `civ-clone.conflicts` keeps each civ1 twin out of it when the plugin list is
//  written; this is the runtime check behind both, as a plugin can still import a Civ1 module that registers something
//  on import. Each set is loaded as the worker loads it (`pluginsFrom`), in a process of its own, and what it
//  registered is then read back from the engine's registries:
//
//  - no rule id starting `civ1-`;
//  - no Religion among the advances, no Arctic among the terrains, and no River as a terrain (Civ2's River is a
//    terrain feature);
//  - no unit, improvement or Wonder that can be built beyond those listed here, and no terrain, feature, tile
//    improvement, government, civilization or difficulty level other than those listed here.
//
// The lists are what the civ2 packages have now: a later stage that adds content updates them, in the same change.
//
// The control loads a deliberately broken set, civ2's plugins with civ1-world added, which a conflict would stop the
//  plugin list from ever being written: it has to fail.
//
//   --scenario civ2                 load the civ2 set and print what it registered
//   --scenario civ2-with-civ1       the same, with civ1-world added
//   --print                         print what the civ2 set registers, to update the lists below from
//
// Imports `src/js/pluginSets.ts`, never `src/js/plugins.ts`, which would run every plugin in the default set.

// Must stay first: seeds `Math.random` before any engine module evaluates.
import './lib/seed';
// The worker client a civ2 game runs in, so that anything it imports that registers on import is counted too.
import '@civ-clone/ui-worker-client/Game';
import {
  PluginSetData,
  pluginsFrom,
} from '@civ-clone/ui-worker-client/Plugins';
import { defaultGame } from '@civ-clone/core-game/defaultGame';
import { execFileSync } from 'child_process';
import pluginSets from '../../src/js/pluginSets';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';

type Inventory = {
  rules: number;
  civ1Rules: string[];
  advances: string[];
  terrains: string[];
  terrainFeatures: string[];
  tileImprovements: string[];
  buildItems: string[];
  governments: string[];
  civilizations: string[];
  difficulties: string[];
};

// What the civ2 set registers now (M2a B3). Nothing can be built yet: Civ2's units, improvements and Wonders, its
//  advances beyond the three civ2-world needs, and its governments come with later stages.
const EXPECTED: Omit<Inventory, 'rules' | 'civ1Rules'> = {
  advances: ['BridgeBuilding', 'Construction', 'RailroadAdvance'],
  terrains: [
    'Desert',
    'Forest',
    'Glacier',
    'Grassland',
    'Hills',
    'Jungle',
    'Mountains',
    'Ocean',
    'Plains',
    'Swamp',
    'Tundra',
  ],
  terrainFeatures: [
    'Buffalo',
    'Coal',
    'Fish',
    'Fruit',
    'Furs',
    'Game',
    'Gems',
    'Gold',
    'Iron',
    'Ivory',
    'Oasis',
    'Oil',
    'Peat',
    'Pheasant',
    'River',
    'Shield',
    'Silk',
    'Spice',
    'Whales',
    'Wheat',
    'Wine',
  ],
  tileImprovements: [
    'Airbase',
    'Farmland',
    'Fortress',
    'Irrigation',
    'Mine',
    'Pollution',
    'Railroad',
    'Road',
  ],
  buildItems: [],
  governments: [],
  civilizations: [
    'American',
    'Aztec',
    'Babylonian',
    'Chinese',
    'Egyptian',
    'English',
    'French',
    'German',
    'Greek',
    'Indian',
    'Japanese',
    'Mongol',
    'Roman',
    'Russian',
    'Sioux',
    'Viking',
    'Zulu',
  ],
  difficulties: ['Chieftain', 'Deity', 'Emperor', 'King', 'Prince', 'Warlord'],
};

const CIV1_WORLD = '@civ-clone/civ1-world',
  scenarioIndex = process.argv.indexOf('--scenario'),
  scenario = scenarioIndex === -1 ? null : process.argv[scenarioIndex + 1];

const names = (types: any[]): string[] =>
  types.map((Type) => typeNameOf(Type)).sort();

const inventory = (): Inventory => {
  const rules = defaultGame.rules.entries();

  return {
    rules: rules.length,
    civ1Rules: rules
      .map((rule) => rule.id())
      .filter((id): id is string => id !== null && id.startsWith('civ1-'))
      .sort(),
    advances: names(defaultGame.advances.entries()),
    terrains: names(defaultGame.terrains.entries()),
    terrainFeatures: names(defaultGame.availableTerrainFeatures.entries()),
    tileImprovements: names(defaultGame.availableTileImprovements.entries()),
    buildItems: names(defaultGame.availableCityBuildItems.entries()),
    governments: names(defaultGame.availableGovernments.entries()),
    civilizations: names(defaultGame.civilizations.entries()),
    difficulties: names(defaultGame.availableDifficulties.entries()),
  };
};

if (scenario !== null) {
  const civ2 = pluginSets.sets.find(({ id }) => id === 'civ2');

  if (!civ2 || !['civ2', 'civ2-with-civ1'].includes(scenario)) {
    process.stderr.write(`FAIL civ2Isolation: bad scenario '${scenario}'\n`);
    process.exit(1);
  }

  const data: PluginSetData =
      scenario === 'civ2'
        ? pluginSets
        : {
            ...pluginSets,
            sets: [
              {
                ...civ2,
                id: 'civ2',
                plugins: [...civ2.plugins, CIV1_WORLD].sort((a, b) =>
                  a.replace('@civ-clone/', '') < b.replace('@civ-clone/', '')
                    ? -1
                    : 1
                ),
              },
            ],
          },
    set = pluginsFrom(data).sets.find(({ id }) => id === 'civ2')!;

  set
    .load()
    .then(() => {
      process.stdout.write(JSON.stringify(inventory()) + '\n');
      process.exit(0);
    })
    .catch((error: any): void => {
      process.stderr.write(`${error?.stack ?? error}\n`);
      process.exit(1);
    });
} else {
  const failures: string[] = [];
  let checks = 0;

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
    },
    run = (name: string): Inventory => {
      try {
        const output = execFileSync(
          process.execPath,
          [process.argv[1], '--scenario', name],
          {
            encoding: 'utf8',
            env: process.env,
            maxBuffer: 64 * 1024 * 1024,
            timeout: 2 * 60 * 1000,
          }
        );

        return JSON.parse(output.trim().split('\n').slice(-1)[0]!);
      } catch (error) {
        process.stderr.write(
          `FAIL civ2Isolation: ${name} did not report\n${
            (error as any)?.stderr || (error as any)?.message || error
          }\n`
        );
        process.exit(1);
      }
    },
    // What the isolation probe refuses, as a list of what it found.
    problems = (found: Inventory): string[] => [
      ...found.civ1Rules.map((id) => `rule ${id}`),
      ...found.advances
        .filter((name) => name === 'Religion')
        .map((name) => `advance ${name}`),
      ...found.terrains
        .filter((name) => ['Arctic', 'River'].includes(name))
        .map((name) => `terrain ${name}`),
      ...found.buildItems
        .filter((name) => !EXPECTED.buildItems.includes(name))
        .map((name) => `build item ${name}`),
    ];

  if (process.argv.includes('--print')) {
    process.stdout.write(JSON.stringify(run('civ2'), null, 2) + '\n');
    process.exit(0);
  }

  const civ2 = run('civ2');

  expect(
    'the civ2 set registers nothing the probe refuses',
    problems(civ2),
    []
  );
  expect(
    'and exactly the content listed: advances, terrains, terrain features (River among them), tile improvements, build items, governments, civilizations and difficulty levels',
    Object.fromEntries(
      Object.keys(EXPECTED).map((key) => [key, (civ2 as any)[key]])
    ),
    EXPECTED
  );

  const broken = run('civ2-with-civ1');

  expect(
    'and the control, civ2 with civ1-world added, is refused: Civ1 rules, and Arctic and River as terrains',
    [
      problems(broken).some((problem) => problem.startsWith('rule civ1-')),
      problems(broken).includes('terrain Arctic'),
      problems(broken).includes('terrain River'),
    ],
    [true, true, true]
  );

  if (failures.length > 0) {
    process.stderr.write(`FAIL civ2Isolation\n${failures.join('\n')}\n`);
    process.exit(1);
  }

  const refused = problems(broken);

  process.stdout.write(
    `PASS civ2Isolation (${checks} checks; civ2 loads ${
      civ2.rules
    } rules; the control was refused for ${refused.length}: ${refused
      .filter((problem) => !problem.startsWith('rule '))
      .join(', ')} and ${
      refused.filter((problem) => problem.startsWith('rule ')).length
    } civ1- rules)\n`
  );
  process.exit(0);
}
