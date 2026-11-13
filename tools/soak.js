#!/usr/bin/env node

// Whole headless games of any plugin set, on any grid, with either kind of player, several seeds at once
// (civ-clone/web-renderer#1008). Each game is `tests/engine/run.ts` in a process of its own; this reports how each
// ended, how long its turns took and anything that went wrong, and fails if any game did. docs/soak.md has more.
//
//   npm run soak -- --set civ1 --clients end-turn --games 8 --until-game-over
//   npm run soak -- --set civ2 --grid staggered-iso --forbid-prefix civ1- --games 8 --turns 150

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { webRenderer } = require('./lib/paths');
const { buildSync } = require('./lib/engineSources');

const START = '<<<conformance';
const END = 'conformance>>>';
const CLIENTS = ['simple-ai', 'end-turn'];
// The last turn a game played until it ends may reach: Civ1's ends by 2100 at the latest, near turn 550.
const UNTIL_GAME_OVER_LIMIT = 1000;

const usage = `usage: soak.js [options]

  --set <id>              the plugin set (src/js/pluginSets.ts), default its default
  --grid <topology>       square, staggered-iso or hex-odd-r, default square
  --clients <kind>        ${CLIENTS.join(' or ')}, default simple-ai
  --games <n>             games to play, seeds 1 to n, default 4
  --seeds <a,b,…>         these seeds instead
  --turns <n>             play to turn n, default 50; with --until-game-over, the limit (default ${UNTIL_GAME_OVER_LIMIT})
  --until-game-over       play until the game ends; reaching the turn limit first fails the game
  --forbid-prefix <p>     fail a game whose rules include an id starting with p (repeatable)
  --players <n>           default 4
  --width <n>, --height <n>  default 60 by 40 (an even height for staggered-iso and hex-odd-r)
  --difficulty <name>     a difficulty's class name, default King
  --jobs <n>              games at once, default half the CPUs
  --timeout <seconds>     per game, default 1800
  --allow-errors          don't fail a game for errors it logged and carried on from
  --json <file>           write every game's report to file`;

const parseArguments = (args) => {
  const options = {
      allowErrors: false,
      clients: 'simple-ai',
      difficulty: null,
      forbidPrefixes: [],
      games: 4,
      grid: null,
      height: null,
      jobs: Math.max(1, Math.floor(os.cpus().length / 2)),
      json: null,
      players: null,
      seeds: null,
      set: null,
      timeout: 1800,
      turns: null,
      untilGameOver: false,
      width: null,
    },
    number = (name, value) => {
      const parsed = Number(value);

      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error(
          `${name} takes a whole number of at least 1, not '${value}'`
        );
      }

      return parsed;
    };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i],
      value = () => {
        if (i + 1 >= args.length) {
          throw new Error(`${arg} needs a value`);
        }

        return args[++i];
      };

    switch (arg) {
      case '--allow-errors':
        options.allowErrors = true;
        break;
      case '--clients':
        options.clients = value();

        if (!CLIENTS.includes(options.clients)) {
          throw new Error(
            `--clients is ${CLIENTS.join(' or ')}, not '${options.clients}'`
          );
        }
        break;
      case '--difficulty':
        options.difficulty = value();
        break;
      case '--forbid-prefix':
        options.forbidPrefixes.push(value());
        break;
      case '--games':
        options.games = number(arg, value());
        break;
      case '--grid':
        options.grid = value();
        break;
      case '--height':
        options.height = number(arg, value());
        break;
      case '--jobs':
        options.jobs = number(arg, value());
        break;
      case '--json':
        options.json = path.resolve(value());
        break;
      case '--players':
        options.players = number(arg, value());
        break;
      case '--seeds':
        options.seeds = value()
          .split(',')
          .map((seed) => number('--seeds', seed));
        break;
      case '--set':
        options.set = value();
        break;
      case '--timeout':
        options.timeout = number(arg, value());
        break;
      case '--turns':
        options.turns = number(arg, value());
        break;
      case '--until-game-over':
        options.untilGameOver = true;
        break;
      case '--width':
        options.width = number(arg, value());
        break;
      case '--help':
      case '-h':
        console.log(usage);
        process.exit(0);
        break;
      default:
        throw new Error(`unknown argument '${arg}'\n\n${usage}`);
    }
  }

  options.seeds ??= Array.from({ length: options.games }, (_, i) => i + 1);

  // A seed is a game: the same one twice would only play it twice, and its two runs would share a file.
  if (new Set(options.seeds).size !== options.seeds.length) {
    throw new Error(
      `--seeds lists a seed more than once: ${options.seeds.join(',')}`
    );
  }
  options.turns ??= options.untilGameOver ? UNTIL_GAME_OVER_LIMIT : 50;

  return options;
};

// `run.ts`'s configuration for one game: only what was asked for, so `run.ts`'s defaults stay the conformance run's.
const configFor = (options, seed) => {
  const config = {
    seed,
    turns: options.turns,
    // Snapshots are for the conformance fixture, and a long game's outgrow the heap.
    checkpoints: [],
    clients: options.clients,
    forbidPrefixes: options.forbidPrefixes,
    untilGameOver: options.untilGameOver,
  };

  [
    ['difficulty', options.difficulty],
    ['grid', options.grid],
    ['height', options.height],
    ['players', options.players],
    ['set', options.set],
    ['width', options.width],
  ].forEach(([key, value]) => {
    if (value !== null) {
      config[key] = value;
    }
  });

  return config;
};

const bundle = (directory) => {
  const outfile = path.join(directory, 'run.js');

  // As tools/conformance.js: the `.ts` sources, and `keepNames` because DataObject ids come from class names.
  buildSync({
    entryPoints: [path.join(webRenderer, 'tests', 'engine', 'run.ts')],
    bundle: true,
    keepNames: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    outfile,
    logLevel: 'error',
  });

  return outfile;
};

// One game, in a process of its own. Its stdout goes to a file, which node writes synchronously, so a long game's
//  document isn't cut off by `process.exit()` before a pipe drains; the AI logs there too.
const play = (entry, directory, options, seed) =>
  new Promise((resolve) => {
    const outPath = path.join(directory, `seed-${seed}.out`),
      fd = fs.openSync(outPath, 'w'),
      started = Date.now(),
      stderr = [];
    let timedOut = false;

    const child = spawn(process.execPath, [entry], {
      cwd: webRenderer,
      env: {
        ...process.env,
        CONFORMANCE_CONFIG: JSON.stringify(configFor(options, seed)),
      },
      stdio: ['ignore', fd, 'pipe'],
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, options.timeout * 1000);

    let stderrLength = 0;

    child.stderr.on('data', (chunk) => {
      stderr.push(chunk);
      stderrLength += chunk.length;

      // The last 64 KB or so is plenty to see what went wrong.
      while (stderr.length > 1 && stderrLength - stderr[0].length > 65536) {
        stderrLength -= stderr.shift().length;
      }
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      fs.closeSync(fd);

      const output = fs.readFileSync(outPath, 'utf8'),
        start = output.indexOf(START),
        end = output.indexOf(END);
      let run = null;

      if (start !== -1 && end !== -1) {
        try {
          run = JSON.parse(output.slice(start + START.length, end)).run ?? null;
        } catch (e) {}
      }

      fs.unlinkSync(outPath);

      resolve({
        seed,
        code,
        signal,
        timedOut,
        seconds: (Date.now() - started) / 1000,
        stderr: Buffer.concat(stderr).toString('utf8'),
        run,
      });
    });
  });

// Why a game failed, if it did.
const problems = (game, options) => {
  const found = [];

  if (game.timedOut) {
    found.push(`timed out after ${options.timeout}s`);
  } else if (game.code !== 0 && game.run?.endReason !== 'isolation') {
    found.push(`exited ${game.code ?? game.signal}`);
  }

  if (!game.run) {
    found.push('no report');

    return found;
  }

  if (game.run.isolation.forbidden.length > 0) {
    found.push(
      `${
        game.run.isolation.forbidden.length
      } forbidden rule id(s): ${game.run.isolation.forbidden
        .slice(0, 5)
        .join(', ')}${game.run.isolation.forbidden.length > 5 ? ', …' : ''}`
    );
  }

  if (game.run.errors > 0 && !options.allowErrors) {
    found.push(`${game.run.errors} error(s) logged`);
  }

  if (options.untilGameOver && game.run.endReason !== 'game-over') {
    found.push(`no ending by turn ${options.turns}`);
  }

  return found;
};

const pad = (value, width) => String(value).padEnd(width);

const line = (game, found) => {
  const run = game.run;

  if (!run) {
    return `seed ${pad(game.seed, 4)} FAIL  ${found.join('; ')}`;
  }

  const ending = run.ending
    ? `${run.ending.reason} turn ${run.ending.turn} (${run.ending.year})`
    : run.endReason;

  return [
    `seed ${pad(game.seed, 4)}`,
    pad(found.length > 0 ? 'FAIL' : 'ok', 5),
    pad(ending, 28),
    `last turn ${pad(run.turn, 4)} (${pad(run.year, 5)})`,
    `${pad(run.msPerTurn ?? '-', 7)} ms/turn`,
    `${pad(run.errors, 3)} errors`,
    `${game.seconds.toFixed(1)}s`,
    found.length > 0 ? `\n           ${found.join('; ')}` : '',
  ].join('  ');
};

const pool = async (items, size, work) => {
  const results = [];
  let next = 0;

  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;

        results[index] = await work(items[index]);
      }
    })
  );

  return results;
};

const main = async () => {
  let options;

  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'soak-')),
    started = Date.now();

  console.log(
    `soak: set ${options.set ?? '(default)'}, grid ${
      options.grid ?? 'square'
    }, ${options.clients} clients, ${options.seeds.length} game(s), ${
      options.untilGameOver
        ? `until game over (limit turn ${options.turns})`
        : `${options.turns} turns`
    }${
      options.forbidPrefixes.length > 0
        ? `, forbidding ${options.forbidPrefixes.join(', ')}`
        : ''
    }, ${Math.min(options.jobs, options.seeds.length)} at once`
  );

  const entry = bundle(directory);

  const games = await pool(options.seeds, options.jobs, async (seed) => {
    const game = await play(entry, directory, options, seed),
      found = problems(game, options);

    console.log(line(game, found));

    if (found.length > 0 && game.stderr.trim() !== '' && !game.run) {
      console.log(
        game.stderr
          .trim()
          .split('\n')
          .slice(-15)
          .map((text) => `           ${text}`)
          .join('\n')
      );
    }

    return { ...game, problems: found };
  });

  fs.rmSync(directory, { recursive: true, force: true });

  const failed = games.filter((game) => game.problems.length > 0),
    seconds = (Date.now() - started) / 1000;

  if (options.json) {
    fs.writeFileSync(
      options.json,
      JSON.stringify(
        {
          options,
          seconds,
          games: games.map(({ stderr, ...game }) => game),
        },
        null,
        2
      ) + '\n'
    );
  }

  console.log(
    `\n${failed.length === 0 ? 'PASS' : 'FAIL'} soak: ${
      games.length - failed.length
    } of ${games.length} game(s) clean in ${seconds.toFixed(1)}s`
  );

  process.exit(failed.length === 0 ? 0 : 1);
};

if (require.main === module) {
  main();
}

module.exports = { configFor, parseArguments };
