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
// The controls load deliberately broken sets, civ2's plugins with civ1-world added (which a conflict would stop the
//  plugin list from ever being written), and with Civ1's improvements, science and units added: each has to fail,
//  the second on Religion and on what can be built, so that every part of the probe is shown to fire.
//
//   --scenario civ2                 load the civ2 set and print what it registered
//   --scenario civ2-with-civ1       the same, with civ1-world added
//   --scenario civ2-with-civ1-content   the same, with civ1-city-improvement, civ1-science and civ1-unit added
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

// What the civ2 set registers now (M2a C): Civ2's 90 advances, 51 units and 7 governments. Its improvements and
//  Wonders come with a later stage (D).
const EXPECTED: Omit<Inventory, 'rules' | 'civ1Rules'> = {
  advances: [
    'AdvancedFlight',
    'Alphabet',
    'AmphibiousWarfare',
    'Astronomy',
    'AtomicTheory',
    'Automobile',
    'Banking',
    'BridgeBuilding',
    'BronzeWorking',
    'CeremonialBurial',
    'Chemistry',
    'Chivalry',
    'CodeOfLaws',
    'CombinedArms',
    'Combustion',
    'CommunismAdvance',
    'Computers',
    'Conscription',
    'Construction',
    'Corporation',
    'Currency',
    'DemocracyAdvance',
    'Economics',
    'Electricity',
    'Electronics',
    'Engineering',
    'Environmentalism',
    'Espionage',
    'Explosives',
    'Feudalism',
    'Flight',
    'FundamentalismAdvance',
    'FusionPower',
    'FutureTechnology',
    'GeneticEngineering',
    'GuerrillaWarfare',
    'Gunpowder',
    'HorsebackRiding',
    'Industrialization',
    'Invention',
    'IronWorking',
    'LaborUnion',
    'Laser',
    'Leadership',
    'Literacy',
    'MachineTools',
    'Magnetism',
    'MapMaking',
    'Masonry',
    'MassProduction',
    'Mathematics',
    'Medicine',
    'Metallurgy',
    'Miniaturization',
    'MobileWarfare',
    'MonarchyAdvance',
    'Monotheism',
    'Mysticism',
    'Navigation',
    'NuclearFission',
    'NuclearPower',
    'Philosophy',
    'Physics',
    'Plastics',
    'Plumbing',
    'Polytheism',
    'Pottery',
    'Radio',
    'RailroadAdvance',
    'Recycling',
    'Refining',
    'Refrigeration',
    'Robotics',
    'Rocketry',
    'Sanitation',
    'Seafaring',
    'SpaceFlight',
    'Stealth',
    'SteamEngine',
    'Steel',
    'Superconductor',
    'Tactics',
    'TheRepublic',
    'TheWheel',
    'Theology',
    'TheoryOfGravity',
    'Trade',
    'UniversityAdvance',
    'WarriorCode',
    'Writing',
  ],
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
  buildItems: [
    'AlpineTrooper',
    'Archer',
    'Artillery',
    'Battleship',
    'Bomber',
    'Cannon',
    'Caravan',
    'Carrier',
    'Catapult',
    'Cavalry',
    'Chariot',
    'CruiseMissile',
    'Cruiser',
    'Crusader',
    'Destroyer',
    'Diplomat',
    'Dragoon',
    'Elephant',
    'Engineer',
    'Explorer',
    'Fanatic',
    'Fighter',
    'Freight',
    'Frigate',
    'Galleon',
    'Helicopter',
    'Horseman',
    'Howitzer',
    'Ironclad',
    'Knight',
    'Marine',
    'MechanizedInfantry',
    'MissileCruiser',
    'Musketman',
    'Nuclear',
    'Paratrooper',
    'Partisan',
    'Pikeman',
    'Rifleman',
    'Sail',
    'Settlers',
    'Spearman',
    'Spy',
    'StealthBomber',
    'StealthFighter',
    'Submarine',
    'Swordman',
    'Tank',
    'Transport',
    'Trireme',
    'Warrior',
  ],
  governments: [
    'Anarchy',
    'Communism',
    'Democracy',
    'Despotism',
    'Fundamentalism',
    'Monarchy',
    'Republic',
  ],
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

// Each control's Civ1 plugins, added to civ2's: Civ1's world, then Civ1's content.
const CONTROLS: { [scenario: string]: string[] } = {
    'civ2-with-civ1': ['@civ-clone/civ1-world'],
    'civ2-with-civ1-content': [
      '@civ-clone/civ1-city-improvement',
      '@civ-clone/civ1-science',
      '@civ-clone/civ1-unit',
    ],
  },
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

  if (!civ2 || !['civ2', ...Object.keys(CONTROLS)].includes(scenario)) {
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
                plugins: [...civ2.plugins, ...CONTROLS[scenario]!].sort(
                  (a, b) =>
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

  const content = run('civ2-with-civ1-content');

  expect(
    'as is civ2 with Civ1’s improvements, science and units added: Civ1 rules, Religion, and improvements that civ2 has none of yet (Civ1’s units are base classes civ2 builds too)',
    [
      problems(content).some((problem) => problem.startsWith('rule civ1-')),
      problems(content).includes('advance Religion'),
      problems(content).includes('build item Barracks'),
      problems(content).includes('build item Granary'),
    ],
    [true, true, true, true]
  );

  if (failures.length > 0) {
    process.stderr.write(`FAIL civ2Isolation\n${failures.join('\n')}\n`);
    process.exit(1);
  }

  const summary = (refused: string[]): string =>
    `${refused.length} (${
      refused.filter((problem) => problem.startsWith('rule ')).length
    } civ1- rules, ${
      refused.filter((problem) => problem.startsWith('build item ')).length
    } build items, ${refused
      .filter((problem) => /^(advance|terrain) /.test(problem))
      .join(', ')})`;

  process.stdout.write(
    `PASS civ2Isolation (${checks} checks; civ2 loads ${
      civ2.rules
    } rules; refused: civ2 with civ1-world for ${summary(
      problems(broken)
    )}, civ2 with Civ1's content for ${summary(problems(content))})\n`
  );
  process.exit(0);
}
