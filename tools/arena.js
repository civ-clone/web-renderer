#!/usr/bin/env node

// AI-vs-AI: seeded headless games in which some seats run the baseline
// `simple-ai-client` and the others the candidate, reported side by side with
// the spread across seeds (civ-clone/web-renderer#202). docs/arena.md has the
// design and how to read the report.
//
//   npm run arena -- --candidate fix/some-branch --games 20
//   npm run arena -- --self-check --games 4 --turns 50
//
// The conformance suite proves a change leaves play identical; this is for the
// changes that are meant not to.

const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { checkoutPath, webRenderer } = require('./lib/paths');

const START = '<<<arena';
const END = 'arena>>>';
// The first commit whose `SimpleAIClient` takes a `StrategyRegistry` as its
// last constructor argument, and so the first that can be given strategies of
// its own rather than the game-wide registry's.
const MINIMUM = 'd660d9b';
const WORKING_TREE = 'working-tree';
const fixturePath = path.join(
  webRenderer,
  'tests',
  'engine',
  'fixtures',
  'baseline.json'
);

// Higher is better (1), lower is better (-1), or neither (0).
const METRICS = [
  ['power', 1],
  ['powerGold', 1],
  ['powerCitizens', 1],
  ['powerAdvances', 1],
  ['powerUnits', 1],
  ['score', 1],
  ['scoreCitizens', 1],
  ['scoreWonders', 1],
  ['scorePollution', 1],
  ['advanceTiers', 1],
  ['cities', 1],
  ['population', 1],
  ['advances', 1],
  ['units', 0],
  ['navalUnits', 0],
  ['unitsCreated', 0],
  ['navalUnitsCreated', 0],
  ['unitsLost', -1],
  ['unitsLostAtSea', -1],
  ['unitsDefeated', 1],
  ['wondersStarted', 0],
  ['wondersBuilt', 1],
  ['improvementsBuilt', 1],
  ['firstCityTurn', -1],
  ['noCityAtTurn10', -1],
  ['gold', 1],
  ['explored', 1],
  ['exploredLand', 1],
  ['exploredSea', 1],
  ['disorderTurns', -1],
  ['disorderCityTurns', -1],
  ['specialists', 0],
  ['specialistTurns', 0],
  ['martialLaw', 0],
  ['trade', 1],
  ['irrigatedTiles', 1],
  ['minedTiles', 1],
  ['roadTiles', 1],
  ['railroadTiles', 1],
  ['unitsInCities', 0],
  ['unitsFortified', 0],
  ['unitsInField', 0],
  ['unitMoves', 0],
  ['pacingMoves', -1],
  ['shields', 1],
  ['unitSupport', -1],
  ['netShields', 1],
  ['tax', 0],
  ['science', 0],
  ['luxuries', 0],
  ['meanLuxuries', 0],
  ['rateChanges', 0],
  ['eliminated', -1],
  ['loopGuardTurns', -1],
  ['loopGuardHits', -1],
  ['unitsSkipped', -1],
  ['skipTurns', -1],
  ['unhandledActions', -1],
];

const usage = `usage: node tools/arena.js [options]

  --baseline <ref|dir>   simple-ai-client git ref or directory
                         (default: the commit pinned in pnpm-lock.yaml)
  --candidate <ref|dir>  (default: ${WORKING_TREE}, the checkout as it is on disk)
  --checkout <dir>       the simple-ai-client checkout (default: its sibling)
  --games <n>            games to play: seeds 1, 1, 2, 2, ... (default: 20)
  --seeds <a,b,...>      play each of these seeds twice instead
  --turns <n>            stop at the start of this turn (default: 150)
  --players <n>          (default: 4)
  --width <n>            (default: 60)
  --height <n>           (default: 40)
  --jobs <n>             games at once (default: ${defaultJobs()})
  --timeout <seconds>    give up on a game after this long (default: 600)
  --out <file>           also write the whole result as JSON
  --self-check           baseline against itself: reproduce the conformance
                         fixture, then require every paired difference to be 0
  --verbose              let the AI's console output through
  --keep                 keep the scratch directory (exported variants, bundle)

Seats alternate: in game g, seat s is the candidate iff (g + s) % 2 == 0, and
each seed is played by games 2k and 2k+1, so every start position on every map
is played once by each AI.`;

function defaultJobs() {
  return Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2)));
}

const parseArguments = (argv) => {
  const options = {
    baseline: null,
    candidate: null,
    checkout: checkoutPath('simple-ai-client'),
    games: 20,
    seeds: null,
    turns: 150,
    players: 4,
    width: 60,
    height: 40,
    jobs: defaultJobs(),
    timeout: 600,
    out: null,
    selfCheck: false,
    verbose: false,
    keep: false,
  };
  const numeric = [
    'games',
    'turns',
    'players',
    'width',
    'height',
    'jobs',
    'timeout',
  ];

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const name = flag
      .replace(/^--/, '')
      .replace(/-(\w)/g, (_, c) => c.toUpperCase());

    if (flag === '--help' || flag === '-h') {
      console.log(usage);
      process.exit(0);
    }

    if (['selfCheck', 'verbose', 'keep'].includes(name)) {
      options[name] = true;

      continue;
    }

    if (!(name in options) || argv[i + 1] === undefined) {
      throw new Error(`unknown or incomplete option: ${flag}\n\n${usage}`);
    }

    const value = argv[(i += 1)];

    if (numeric.includes(name)) {
      options[name] = Number(value);

      if (!Number.isInteger(options[name]) || options[name] < 1) {
        throw new Error(`${flag} takes a positive integer, not ${value}`);
      }

      continue;
    }

    if (name === 'seeds') {
      options.seeds = value.split(',').map(Number);

      if (options.seeds.some((seed) => !Number.isInteger(seed))) {
        throw new Error(`--seeds takes a comma-separated list of integers`);
      }

      continue;
    }

    options[name] = value;
  }

  return options;
};

const git = (checkout, ...args) =>
  execFileSync('git', ['-C', checkout, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

const pinnedCommit = () => {
  const lock = fs.readFileSync(
    path.join(webRenderer, 'pnpm-lock.yaml'),
    'utf8'
  );
  const match = lock.match(/simple-ai-client\/tar\.gz\/([0-9a-f]{40})/);

  if (!match) {
    throw new Error('pnpm-lock.yaml pins no simple-ai-client commit');
  }

  return match[1];
};

// The parameter names of `SimpleAIClient`'s constructor, in order, read from
// the source so that the arena passes `strategyRegistry` wherever this
// variant has it.
const constructorParameters = (source) => {
  const start = source.indexOf('constructor(');

  if (start === -1) {
    return [];
  }

  let depth = 0;
  let current = '';
  const parameters = [];
  const text = source
    .slice(start + 'constructor('.length)
    .replace(/\/\/[^\n]*/g, '')
    .replace(/=>/g, '');

  for (const character of text) {
    if ('(<{['.includes(character)) {
      depth += 1;
    }

    if (')>}]'.includes(character)) {
      if (depth === 0) {
        break;
      }

      depth -= 1;
    }

    if (character === ',' && depth === 0) {
      parameters.push(current);
      current = '';

      continue;
    }

    current += character;
  }

  parameters.push(current);

  return parameters
    .map((parameter) =>
      parameter
        .trim()
        .replace(/^(?:(?:private|public|protected|readonly)\s+)*/, '')
        .match(/^(\w+)/)
    )
    .filter(Boolean)
    .map((match) => match[1]);
};

const tooOld = (label) =>
  new Error(
    `${label}: simple-ai-client from before ${MINIMUM} can't be given its own strategies, so it can't share a game with another copy. Use ${MINIMUM} or later.`
  );

// Puts one variant's source in `directory`, with no `node_modules` of its own:
// a stale copy there would be resolved ahead of web-renderer's and give the
// variant classes of its own.
const exportVariant = (spec, checkout, directory) => {
  fs.mkdirSync(directory, { recursive: true });

  const copy = (source) =>
    fs.cpSync(source, directory, {
      recursive: true,
      filter: (file) =>
        !path
          .relative(source, file)
          .split(path.sep)
          .some((part) => part === 'node_modules' || part === '.git'),
    });

  if (spec === WORKING_TREE) {
    const head = git(checkout, 'rev-parse', '--short', 'HEAD');
    const branch = git(checkout, 'rev-parse', '--abbrev-ref', 'HEAD');
    const dirty = git(
      checkout,
      'status',
      '--porcelain',
      '--untracked-files=no'
    );

    copy(checkout);

    return `${WORKING_TREE} (${branch} @ ${head}${dirty ? ', modified' : ''})`;
  }

  const asDirectory = path.resolve(spec);

  if (fs.existsSync(asDirectory) && fs.statSync(asDirectory).isDirectory()) {
    copy(asDirectory);

    return asDirectory;
  }

  let commit;

  try {
    commit = git(checkout, 'rev-parse', '--verify', `${spec}^{commit}`);
  } catch (error) {
    throw new Error(
      `${spec} is neither a directory nor a git ref in ${checkout}`
    );
  }

  const label = spec.startsWith(commit.slice(0, 7))
    ? commit.slice(0, 7)
    : `${spec} (${commit.slice(0, 7)})`;

  try {
    git(checkout, 'merge-base', '--is-ancestor', MINIMUM, commit);
  } catch (error) {
    throw tooOld(label);
  }

  execFileSync(
    'sh',
    [
      '-c',
      'git -C "$0" archive "$1" | tar -x -C "$2"',
      checkout,
      commit,
      directory,
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] }
  );

  return label;
};

const inspectVariant = (label, directory) => {
  const read = (file) => {
    const full = path.join(directory, file);

    return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
  };
  const strategies = read('registerStrategies.ts');
  const strategyRegistryIndex = constructorParameters(
    read('SimpleAIClient.ts')
  ).indexOf('strategyRegistry');

  if (
    strategyRegistryIndex < 1 ||
    !read('registerRules.ts') ||
    !/export (const|function) createStrategies\b/.test(strategies) ||
    !/export (const|function) dependenciesFor\b/.test(strategies)
  ) {
    throw tooOld(label);
  }

  return { strategyRegistryIndex };
};

// The two modules the bundle is built around. `variants.ts` stands where
// `run.ts` imports `SimpleAIClient`; `plugin-variants.ts` stands where the
// plugin list imports the installed package's `index`, and registers each
// variant's rules there, in the same position. It doesn't import either
// variant's `index`, whose `registerAIClient` has nothing to do in a headless
// game.
const generate = (root, variants) => {
  const variantsPath = path.join(root, 'variants.ts');
  const pluginPath = path.join(root, 'plugin-variants.ts');
  const roles = Object.keys(variants);
  const at = (role, file) => JSON.stringify(path.join(root, role, file));

  fs.writeFileSync(
    variantsPath,
    `${roles
      .map((role) => `import ${role} from ${at(role, 'SimpleAIClient')};`)
      .join('\n')}

export default {
${roles
  .map(
    (role) => `  ${role}: {
    label: ${JSON.stringify(variants[role].label)},
    SimpleAIClient: ${role},
    strategies: {},
    strategyRegistryIndex: ${variants[role].strategyRegistryIndex},
  },`
  )
  .join('\n')}
} as any;
`
  );

  fs.writeFileSync(
    pluginPath,
    `import variants from ${JSON.stringify(variantsPath.replace(/\.ts$/, ''))};
${roles
  .map(
    (role) => `import ${JSON.stringify(path.join(root, role, 'registerRules'))};
import * as ${role}Strategies from ${at(role, 'registerStrategies')};`
  )
  .join('\n')}
import { defaultGame } from '@civ-clone/core-game';

${roles
  .map(
    (role) => `variants.${role}.strategies = {
  createStrategies: ${role}Strategies.createStrategies,
  dependenciesFor: ${role}Strategies.dependenciesFor,
  game: defaultGame,
};`
  )
  .join('\n')}
`
  );

  return { pluginPath, variantsPath };
};

const bundle = async (root, { pluginPath, variantsPath }) => {
  const outfile = path.join(root, 'arena.js');
  const pluginsSource = path.join(webRenderer, 'src', 'js', 'plugins.ts');
  const installed = /\/@civ-clone\/simple-ai-client\//;

  const result = await require('esbuild').build({
    entryPoints: [path.join(webRenderer, 'tests', 'engine', 'arena.ts')],
    absWorkingDir: webRenderer,
    bundle: true,
    keepNames: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    outfile,
    logLevel: 'error',
    metafile: true,
    // The variants live outside any `node_modules`, so their `@civ-clone`
    // imports resolve here, to the same copies the plugin list loads.
    nodePaths: [path.join(webRenderer, 'node_modules')],
    plugins: [
      {
        name: 'arena',
        setup(build) {
          build.onResolve({ filter: /^arena:variants$/ }, () => ({
            path: variantsPath,
          }));

          build.onLoad(
            { filter: /[\\/]src[\\/]js[\\/]plugins\.ts$/ },
            (args) => {
              if (path.resolve(args.path) !== pluginsSource) {
                return undefined;
              }

              const lines = fs.readFileSync(pluginsSource, 'utf8').split('\n');
              const index = lines.findIndex(
                (line) => line.startsWith('import ') && installed.test(line)
              );

              if (
                index === -1 ||
                lines.findIndex(
                  (line, i) =>
                    i > index &&
                    line.startsWith('import ') &&
                    installed.test(line)
                ) !== -1
              ) {
                throw new Error(
                  'expected exactly one simple-ai-client import in src/js/plugins.ts'
                );
              }

              lines[index] = `import ${JSON.stringify(pluginPath)};`;

              return {
                contents: lines.join('\n'),
                loader: 'ts',
                resolveDir: path.dirname(pluginsSource),
              };
            }
          );
        },
      },
    ],
  });

  return { outfile, inputs: Object.keys(result.metafile.inputs) };
};

// Two copies of the AI and one of everything else, read from what esbuild
// actually bundled. A second copy of a core package would be a second set of
// classes, and `instanceof` across the two would quietly be false.
const checkBundle = (root, inputs) => {
  const copies = new Map();
  const variantFiles = { baseline: 0, candidate: 0 };

  inputs
    .map((input) => path.resolve(webRenderer, input))
    .forEach((file) => {
      Object.keys(variantFiles).forEach((role) => {
        if (file.startsWith(path.join(root, role) + path.sep)) {
          variantFiles[role] += 1;
        }
      });

      const at = file.lastIndexOf(`${path.sep}node_modules${path.sep}`);

      if (at === -1) {
        return;
      }

      const rest = file.slice(at + '/node_modules/'.length).split(path.sep);
      const name = rest[0].startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0];
      const directory = file.slice(
        0,
        at + '/node_modules/'.length + name.length
      );

      if (!copies.has(name)) {
        copies.set(name, new Set());
      }

      copies.get(name).add(directory);
    });

  const problems = [];

  if (copies.has('@civ-clone/simple-ai-client')) {
    problems.push('the installed simple-ai-client is in the bundle');
  }

  Object.entries(variantFiles).forEach(([role, count]) => {
    if (count === 0) {
      problems.push(`nothing from the ${role} variant is in the bundle`);
    }
  });

  copies.forEach((directories, name) => {
    if (directories.size > 1) {
      problems.push(`${name} is bundled twice: ${[...directories].join(', ')}`);
    }
  });

  if (problems.length > 0) {
    throw new Error(`the bundle is wrong:\n  ${problems.join('\n  ')}`);
  }

  return {
    packages: copies.size,
    baselineFiles: variantFiles.baseline,
    candidateFiles: variantFiles.candidate,
  };
};

const seatingFor = (game, players) =>
  new Array(players)
    .fill(0)
    .map((_, seat) => ((game + seat) % 2 === 0 ? 'candidate' : 'baseline'));

const schedule = (options) => {
  if (options.seeds) {
    return options.seeds.flatMap((seed, i) =>
      [0, 1].map((flip) => ({
        index: i * 2 + flip,
        seed,
        seating: seatingFor(flip, options.players),
      }))
    );
  }

  return new Array(options.games).fill(0).map((_, index) => ({
    index,
    seed: Math.floor(index / 2) + 1,
    seating: seatingFor(index, options.players),
  }));
};

const play = (outfile, game, options, checkpoints = []) =>
  new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [outfile], {
      cwd: webRenderer,
      env: {
        ...process.env,
        CONFORMANCE_CONFIG: JSON.stringify({
          checkpoints,
          height: options.height,
          players: options.players,
          seed: game.seed,
          turns: options.turns,
          width: options.width,
        }),
        ARENA_CONFIG: JSON.stringify({
          seating: game.seating,
          verbose: options.verbose,
        }),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      stderr += `\nkilled after ${options.timeout}s`;
      child.kill('SIGKILL');
    }, options.timeout * 1000);

    child.stdout.on('data', (chunk) => {
      stdout += chunk;

      if (options.verbose) {
        process.stdout.write(chunk);
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;

      if (options.verbose) {
        process.stderr.write(chunk);
      }
    });
    child.on('close', (code) => {
      clearTimeout(timer);

      const elapsed = (Date.now() - started) / 1000;
      const start = stdout.indexOf(START);
      const end = stdout.indexOf(END);

      if (code !== 0 || start === -1 || end === -1) {
        resolve({
          ...game,
          elapsed,
          error: `exit ${code}: ${(stderr || stdout).trim().slice(-1500)}`,
        });

        return;
      }

      resolve({
        ...game,
        elapsed,
        ...JSON.parse(stdout.slice(start + START.length, end)),
      });
    });
  });

const pool = async (games, jobs, run) => {
  const results = new Array(games.length);
  let next = 0;

  await Promise.all(
    new Array(Math.min(jobs, games.length)).fill(0).map(async () => {
      while (next < games.length) {
        const i = next;

        next += 1;
        results[i] = await run(games[i]);
      }
    })
  );

  return results;
};

const describe = (values) => {
  const n = values.length;

  if (n === 0) {
    return { n, mean: null, sd: null, min: null, max: null };
  }

  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sd =
    n > 1
      ? Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1))
      : 0;

  return { n, mean, sd, min: Math.min(...values), max: Math.max(...values) };
};

// Every start position is played once by each AI, so the sharpest comparison
// is seat by seat: the candidate's result from the seat, less the baseline's
// from the same seat on the same map.
const pairs = (games) => {
  const bySeed = new Map();

  games
    .filter((game) => !game.error)
    .forEach((game) => {
      if (!bySeed.has(game.seed)) {
        bySeed.set(game.seed, []);
      }

      bySeed.get(game.seed).push(game);
    });

  const found = [];

  bySeed.forEach((played, seed) => {
    const [a, b] = played;

    if (!a || !b) {
      return;
    }

    a.seats.forEach((seat, i) => {
      const other = b.seats[i];

      if (seat.role === other.role) {
        return;
      }

      const [candidate, baseline] =
        seat.role === 'candidate' ? [seat, other] : [other, seat];

      found.push({ seed, seat: i, candidate, baseline });
    });
  });

  return found;
};

const summarise = (games) => {
  const seats = games
    .filter((game) => !game.error)
    .flatMap((game) => game.seats);
  const paired = pairs(games);

  return Object.fromEntries(
    METRICS.map(([metric, direction]) => {
      const of = (role) =>
        describe(
          seats
            .filter((seat) => seat.role === role)
            .map((seat) => seat.metrics[metric])
        );
      const differences = describe(
        paired.map(
          ({ candidate, baseline }) =>
            candidate.metrics[metric] - baseline.metrics[metric]
        )
      );
      const se =
        differences.n > 1 ? differences.sd / Math.sqrt(differences.n) : null;
      const t =
        se === null || differences.mean === null
          ? null
          : se === 0
          ? differences.mean === 0
            ? 0
            : Infinity * Math.sign(differences.mean)
          : differences.mean / se;

      return [
        metric,
        {
          direction,
          baseline: of('baseline'),
          candidate: of('candidate'),
          paired: { ...differences, se, t },
        },
      ];
    })
  );
};

const verdict = ({ direction, paired: { t } }) => {
  if (t === null || Math.abs(t) < 2) {
    return '~';
  }

  if (direction === 0) {
    return t > 0 ? 'higher' : 'lower';
  }

  return Math.sign(t) === direction ? 'better' : 'worse';
};

const format = (value, digits = 1) =>
  value === null || value === undefined
    ? '-'
    : Number.isFinite(value)
    ? Number.isInteger(value)
      ? String(value)
      : value.toFixed(digits)
    : value > 0
    ? 'inf'
    : '-inf';

const table = (rows) => {
  const widths = rows[0].map((_, i) =>
    Math.max(...rows.map((row) => String(row[i]).length))
  );

  return rows
    .map((row) =>
      row
        .map((cell, i) =>
          i === 0
            ? String(cell).padEnd(widths[i])
            : String(cell).padStart(widths[i])
        )
        .join('  ')
    )
    .join('\n');
};

const printGames = (games) => {
  const columns = [
    ['power', 'power'],
    ['score', 'score'],
    ['cities', 'cities'],
    ['population', 'pop'],
    ['advances', 'adv'],
    ['units', 'units'],
    ['navalUnitsCreated', 'ships'],
    ['unitsDefeated', 'won'],
    ['unitsLost', 'lost'],
    ['wondersBuilt', 'wonders'],
    ['improvementsBuilt', 'impr'],
    ['firstCityTurn', '1st city'],
    ['gold', 'gold'],
    ['explored', 'seen'],
    ['exploredSea', 'sea'],
    ['disorderTurns', 'disorder'],
    ['specialists', 'spec'],
    ['luxuries', 'lux'],
    ['rateChanges', 'rates'],
    ['eliminated', 'out'],
    ['loopGuardTurns', 'guard'],
    ['unitsSkipped', 'skipped'],
  ];
  const rows = [
    [
      'game',
      'seed',
      'seat',
      'AI',
      'civilization',
      ...columns.map(([, h]) => h),
    ],
  ];

  games.forEach((game) => {
    if (game.error) {
      rows.push([
        game.index + 1,
        game.seed,
        '-',
        game.seating.map((role) => role[0].toUpperCase()).join(''),
        'FAILED',
        ...columns.map(() => ''),
      ]);

      return;
    }

    game.seats.forEach((seat) =>
      rows.push([
        game.index + 1,
        game.seed,
        seat.seat,
        seat.role,
        seat.civilization,
        ...columns.map(([metric]) => seat.metrics[metric]),
      ])
    );
  });

  console.log(table(rows));
};

const printSummary = (summary) => {
  const range = ({ mean, sd, min, max }) =>
    `${format(mean)} ± ${format(sd)}  [${format(min)}–${format(max)}]`;
  const rows = [
    [
      'metric',
      'baseline mean ± sd [min–max]',
      'candidate',
      'Δ paired ± se',
      't',
      '',
    ],
  ];

  Object.entries(summary).forEach(([metric, entry]) =>
    rows.push([
      metric,
      range(entry.baseline),
      range(entry.candidate),
      `${entry.paired.mean > 0 ? '+' : ''}${format(
        entry.paired.mean,
        2
      )} ± ${format(entry.paired.se, 2)}`,
      format(entry.paired.t),
      verdict(entry),
    ])
  );

  console.log(table(rows));
};

// A conformance game with both copies of the baseline seated alternately: if
// the arena harness or the second copy changed play at all, the fixture's
// checksums move.
const conformanceCheck = async (outfile, options) => {
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const { seed, turns, players, width, height, checkpoints } = fixture.config;
  const result = await play(
    outfile,
    { index: 0, seed, seating: seatingFor(0, players) },
    { ...options, turns, players, width, height },
    checkpoints
  );

  if (result.error) {
    return { pass: false, error: result.error };
  }

  const rows = checkpoints.map((turn) => ({
    turn,
    expected: fixture.checksums[turn],
    actual: result.checksums[turn],
  }));

  return {
    pass: rows.every(({ expected, actual }) => expected === actual),
    seating: result.seating,
    config: fixture.config,
    checksums: rows,
    elapsed: result.elapsed,
  };
};

// Baseline against itself plays the same game from both seatings, so every
// seat's result is the same whichever copy sat in it. Anything but zero is
// the harness, not the AI.
const identicalCheck = (games) => {
  const differences = [];

  pairs(games).forEach(({ seed, seat, candidate, baseline }) =>
    METRICS.forEach(([metric]) => {
      if (candidate.metrics[metric] !== baseline.metrics[metric]) {
        differences.push(
          `seed ${seed} seat ${seat} ${metric}: ${baseline.metrics[metric]} vs ${candidate.metrics[metric]}`
        );
      }
    })
  );

  return {
    pass: differences.length === 0,
    pairs: pairs(games).length,
    differences,
  };
};

const main = async () => {
  const options = parseArguments(process.argv.slice(2));
  const baselineSpec = options.baseline ?? pinnedCommit();
  const candidateSpec = options.selfCheck
    ? baselineSpec
    : options.candidate ?? WORKING_TREE;

  if (options.selfCheck && options.candidate) {
    throw new Error(
      '--self-check plays the baseline against itself; drop --candidate'
    );
  }

  // Real path: esbuild reports its inputs by theirs, and macOS's tmpdir is a
  // symlink.
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'arena-'))
  );
  const started = Date.now();

  try {
    const variants = {};

    [
      ['baseline', baselineSpec],
      ['candidate', candidateSpec],
    ].forEach(([role, spec]) => {
      const label = exportVariant(
        spec,
        options.checkout,
        path.join(root, role)
      );

      variants[role] = {
        label: options.selfCheck ? `${label} [${role} copy]` : label,
        ...inspectVariant(label, path.join(root, role)),
      };
    });

    console.log(`baseline:  ${variants.baseline.label}`);
    console.log(`candidate: ${variants.candidate.label}`);

    const { outfile, inputs } = await bundle(root, generate(root, variants));
    const bundled = checkBundle(root, inputs);

    console.log(
      `bundle: ${bundled.baselineFiles} baseline and ${bundled.candidateFiles} candidate files, one copy each of ${bundled.packages} packages`
    );

    const output = {
      variants: {
        baseline: variants.baseline.label,
        candidate: variants.candidate.label,
      },
      options: {
        turns: options.turns,
        players: options.players,
        width: options.width,
        height: options.height,
      },
      bundle: bundled,
    };

    if (options.selfCheck) {
      process.stdout.write(
        '\nself-check 1: both copies seated alternately reproduce the conformance fixture... '
      );

      const conformance = await conformanceCheck(outfile, options);

      output.conformance = conformance;

      if (conformance.error) {
        console.log(`FAILED\n${conformance.error}`);
      } else {
        console.log(
          `${conformance.pass ? 'yes' : 'NO'} (${conformance.elapsed.toFixed(
            1
          )}s)`
        );
        conformance.checksums.forEach(({ turn, expected, actual }) =>
          console.log(
            `  turn ${String(turn).padStart(
              3
            )}  fixture ${expected}  arena ${actual}${
              expected === actual ? '' : '  <- differs'
            }`
          )
        );
      }
    }

    const planned = schedule(options);

    console.log(
      `\nplaying ${planned.length} games of ${options.turns} turns, ${options.players} players, ${options.width}x${options.height}, ${options.jobs} at a time`
    );

    let done = 0;
    const games = await pool(planned, options.jobs, async (game) => {
      const result = await play(outfile, game, options);

      done += 1;
      console.log(
        `  ${String(done).padStart(String(planned.length).length)}/${
          planned.length
        }  game ${game.index + 1}  seed ${game.seed}  ${game.seating
          .map((role) => role[0].toUpperCase())
          .join('')}  ${result.elapsed.toFixed(1)}s${
          result.error ? '  FAILED' : ''
        }`
      );

      return result;
    });

    const failed = games.filter((game) => game.error);
    const summary = summarise(games);

    output.games = games.map(
      ({
        error,
        index,
        seed,
        seating,
        elapsed,
        seats,
        errorsLogged,
        mathRandomCalls,
      }) => ({
        index,
        seed,
        seating,
        elapsed,
        ...(error ? { error } : { seats, errorsLogged, mathRandomCalls }),
      })
    );
    output.summary = summary;

    console.log('');
    printGames(games);
    console.log('');
    printSummary(summary);
    console.log(
      `\n${games.length - failed.length} games played, ${
        failed.length
      } failed, ${pairs(games).length} seat pairs, ${(
        (Date.now() - started) /
        1000
      ).toFixed(
        0
      )}s. Δ is candidate minus baseline in the same seat of the same map; |t| >= 2 is marked.`
    );

    failed.forEach((game) =>
      console.log(
        `\ngame ${game.index + 1} (seed ${game.seed}) failed:\n${game.error}`
      )
    );

    let exitCode = failed.length > 0 ? 1 : 0;

    if (options.selfCheck) {
      const identical = identicalCheck(games);

      output.identical = identical;
      console.log(
        `\nself-check 2: every seat plays the same whichever copy sat in it... ${
          identical.pass ? 'yes' : 'NO'
        } (${identical.pairs} seat pairs)`
      );
      identical.differences
        .slice(0, 20)
        .forEach((line) => console.log(`  ${line}`));

      if (!identical.pass || !output.conformance.pass) {
        exitCode = 1;
      }

      console.log(`\nself-check: ${exitCode === 0 ? 'pass' : 'FAIL'}`);
    }

    if (options.out) {
      fs.writeFileSync(
        path.resolve(options.out),
        JSON.stringify(output, null, 2) + '\n'
      );
      console.log(`\nwrote ${options.out}`);
    }

    process.exitCode = exitCode;
  } finally {
    if (options.keep) {
      console.log(`\nscratch directory kept: ${root}`);
    } else {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
