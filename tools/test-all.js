#!/usr/bin/env node

// `npm test`: every `test:*` script in package.json, several at a time (#879).
//
//   npm test                         everything
//   npm test -- city window          only the scripts whose name has "city" or "window" in it
//   npm test -- --for packages/map   only the suites whose imports reach a file under that path (and the checks
//                                    that aren't suites, which are quick)
//   npm test -- --jobs 1             one at a time
//   npm test -- --list               what would run, and nothing more
//
// They used to be one `&&` chain, run one after another: about three minutes on the four cores CI has, most of it
// spent waiting. Each suite is its own process, and the files they share, `src/js/plugins.ts` and `translations.ts`,
// are only rewritten when they would change, so they can run side by side. The type-checks run alongside them. The
// suites are bundled together first, a kind at a time, rather than each bundling the same engine or interface for
// itself.
//
// What runs is every script named `test:*`, but for the ones that rewrite a fixture (`…:update`) and those in
// `NOT_PART_OF_IT`. So a new suite needs its script and nothing else: there is no list to add it to.
//
// Each script's output is kept until it finishes and printed whole, so two never interleave. A run passes when every
// script exited 0; the ones that failed are named, with their output, again at the end.

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { bundleAll, bundleOptions } = require('./lib/suite');
const { webRenderer } = require('./lib/paths');
const { withEngineSources } = require('./lib/engineSources');

const scripts = require(path.join(webRenderer, 'package.json')).scripts,
  // Written before anything is bundled: every engine suite imports the plugin list, every ui suite the translations.
  FIRST = ['build:generate-plugins-ts', 'build:generate-translations-ts'],
  // Alongside the suites: they read the source and write nothing (`noEmit`).
  TYPE_CHECKS = ['ts:compile', 'ts:compile:tests', 'ts:compile:strict'],
  // Started first, as they take longest: left to their place in package.json they start late, and everything waits
  //  for them at the end.
  LONGEST_FIRST = [
    'test:overlap-draw:1of4',
    'test:overlap-draw:2of4',
    'test:overlap-draw:3of4',
    'test:overlap-draw:4of4',
    'test:banner-tooltip',
  ],
  // `test:*` scripts that are not part of `npm test`: the browser check needs the build and a browser, and has its
  //  own step in CI.
  NOT_PART_OF_IT = ['test:browser'],
  usage =
    'usage: npm test [-- [--jobs <n>] [--list] [--for <path>]… [<part of a script name>…]]';

const parseArguments = (argv) => {
  const options = { jobs: null, list: false, paths: [], names: [] };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    if (argument === '--jobs' || argument === '--for') {
      const value = argv[++index];

      if (value === undefined) {
        return { error: usage };
      }

      if (argument === '--jobs') {
        options.jobs = Number(value);

        if (!Number.isInteger(options.jobs) || options.jobs < 1) {
          return { error: usage };
        }
      } else {
        options.paths.push(value);
      }
    } else if (argument === '--list') {
      options.list = true;
    } else if (argument.startsWith('-')) {
      return { error: usage };
    } else {
      options.names.push(argument);
    }
  }

  return options;
};

// A suite's kind and name, for a script that runs one through `run-suite.js`, or `null`.
const suiteOf = (name) => {
  const match = /^node tools\/run-suite\.js (engine|ui) (\S+)/.exec(
    scripts[name] ?? ''
  );

  return match === null ? null : { kind: match[1], name: match[2] };
};

// The files a suite is made of, as esbuild finds them when it is bundled the way the suites are: what `--for` asks
//  about.
const inputsOf = async ({ kind, name }) => {
  const { metafile } = await require('esbuild').build(
    withEngineSources({
      entryPoints: [path.join(webRenderer, 'tests', kind, `${name}.ts`)],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      write: false,
      metafile: true,
      logLevel: 'silent',
      absWorkingDir: webRenderer,
      ...bundleOptions(kind),
    })
  );

  return (
    Object.keys(metafile.inputs)
      // Not what a plugin made up (a `namespace:path` input): only files.
      .filter((input) => !/^[\w-]+:/.test(input))
      .map((input) =>
        // A package in the workspace is reached through its link in node_modules: asked about by where it really is.
        path.relative(
          webRenderer,
          fs.realpathSync(path.resolve(webRenderer, input))
        )
      )
  );
};

// The scripts to run, in package.json's order.
const select = async ({ names, paths }) => {
  let selected = Object.keys(scripts).filter(
    (name) =>
      name.startsWith('test:') &&
      !name.endsWith(':update') &&
      !NOT_PART_OF_IT.includes(name)
  );

  if (names.length > 0) {
    selected = selected.filter((name) =>
      names.some((part) => name.includes(part))
    );
  }

  if (paths.length > 0) {
    const wanted = paths.map((given) =>
        path
          .relative(webRenderer, path.resolve(process.cwd(), given))
          .replace(/\/+$/, '')
      ),
      reaches = await Promise.all(
        selected.map(async (name) => {
          const suite = suiteOf(name);

          // Not a suite: one of the quick checks, which read what they like.
          if (suite === null) {
            return true;
          }

          try {
            return (await inputsOf(suite)).some((input) =>
              wanted.some(
                (prefix) =>
                  // The whole checkout, asked for as `.`, is everything.
                  prefix === '' ||
                  input === prefix ||
                  input.startsWith(`${prefix}/`)
              )
            );
          } catch {
            // One that won't bundle is one to run, and hear why.
            return true;
          }
        })
      );

    selected = selected.filter((_, index) => reaches[index]);
  }

  return [
    ...LONGEST_FIRST.filter((name) => selected.includes(name)),
    ...selected.filter((name) => !LONGEST_FIRST.includes(name)),
  ];
};

// One script, as `npm run` would run it, but without starting npm for each of two hundred: its command, through the
//  shell, with the project's own binaries on the PATH. Resolves with how it went; its output is kept, not shown.
const run = (name, env = {}) =>
  new Promise((resolve) => {
    const started = Date.now(),
      output = [],
      child = spawn(scripts[name], {
        cwd: webRenderer,
        // A group of its own, so that stopping the run stops what the script's shell started too.
        detached: true,
        env: {
          ...process.env,
          ...env,
          PATH: `${path.join(webRenderer, 'node_modules', '.bin')}${
            path.delimiter
          }${process.env.PATH}`,
        },
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

    running.add(child);

    child.stdout.on('data', (chunk) => output.push(chunk));
    child.stderr.on('data', (chunk) => output.push(chunk));
    child.on('error', (error) => output.push(Buffer.from(`${error}\n`)));
    child.on('close', (code, signal) => {
      running.delete(child);

      resolve({
        name,
        passed: code === 0,
        how: signal ?? `exit ${code}`,
        seconds: (Date.now() - started) / 1000,
        output: Buffer.concat(output).toString('utf8').trimEnd(),
      });
    });
  });

const running = new Set();

// Where the suites' bundles are, while a run has them: removed when it ends, however it ends.
let bundles = null;

const discardBundles = () => {
  if (bundles !== null) {
    fs.rmSync(bundles, { recursive: true, force: true });
    bundles = null;
  }
};

const report = ({ name, passed, how, seconds, output }) =>
  process.stdout.write(
    `\n> ${name} (${seconds.toFixed(1)}s)${passed ? '' : ` FAILED (${how})`}\n${
      output ? `${output}\n` : ''
    }`
  );

/**
 * Bundles every suite about to run, a kind at a time, in one build each: the engine suites all import the whole
 * engine and the ui suites most of the interface, and bundling each on its own read that code once per suite.
 * The suites find theirs through `SUITE_BUNDLES` (tools/lib/suite.js). If the build fails (one suite that won't
 * compile fails it for all), nothing is said here: each suite bundles itself, as it does when run alone, and the one
 * at fault says why.
 */
const bundleSuites = async (queue) => {
  const byKind = { engine: new Set(), ui: new Set() };

  queue.forEach((name) => {
    const suite = suiteOf(name);

    if (suite !== null) {
      byKind[suite.kind].add(suite.name);
    }
  });

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'suites-'));

  bundles = directory;

  // Both builds are waited for, whichever fails: one still writing would put back a directory just removed.
  const built = await Promise.allSettled(
    Object.entries(byKind)
      .filter(([, names]) => names.size > 0)
      .map(([kind, names]) => bundleAll(kind, [...names], directory))
  );

  if (built.some(({ status }) => status === 'rejected')) {
    discardBundles();

    return {};
  }

  return { SUITE_BUNDLES: directory };
};

const main = async () => {
  const options = parseArguments(process.argv.slice(2));

  if (options.error) {
    process.stderr.write(`${options.error}\n`);
    process.exitCode = 2;

    return;
  }

  const started = Date.now(),
    jobs = options.jobs ?? Math.max(1, os.availableParallelism()),
    all = options.names.length === 0 && options.paths.length === 0;

  // First, and one at a time: what every bundle reads. Not just to list what would run, unless that takes bundling
  //  the suites to see what they import.
  if (!options.list || options.paths.length > 0) {
    for (const name of FIRST) {
      const result = await run(name);

      if (!result.passed) {
        report(result);
        process.stdout.write(`\nFAIL ${name}: nothing else was run\n`);
        process.exitCode = 1;

        return;
      }
    }
  }

  const selected = await select(options),
    // The type-checks with a full run, or when asked for by name.
    queue = [
      ...TYPE_CHECKS.filter(
        (name) => all || options.names.some((part) => name.includes(part))
      ),
      ...selected,
    ];

  if (options.list) {
    process.stdout.write(`${queue.join('\n')}\n`);

    return;
  }

  if (queue.length === 0) {
    process.stderr.write('FAIL nothing to run: no script matches\n');
    process.exitCode = 1;

    return;
  }

  const results = [],
    env = await bundleSuites(queue);
  let next = 0;

  try {
    await Promise.all(
      Array.from({ length: Math.min(jobs, queue.length) }, async () => {
        while (next < queue.length) {
          const result = await run(queue[next++], env);

          results.push(result);
          report(result);
        }
      })
    );
  } finally {
    discardBundles();
  }

  const failed = results.filter(({ passed }) => !passed),
    work = results.reduce((total, { seconds }) => total + seconds, 0),
    took = `${((Date.now() - started) / 1000).toFixed(1)}s (${work.toFixed(
      0
    )}s of work, ${Math.min(jobs, queue.length)} at a time)`;

  // The exit code is set, not exited with: what has been written may still be on its way down a pipe.
  if (failed.length > 0) {
    process.stdout.write(
      `\n${'='.repeat(72)}\nFAIL ${failed.length} of ${
        results.length
      } in ${took}: ${failed.map(({ name }) => name).join(', ')}\n`
    );
    failed.forEach(report);
    process.exitCode = 1;

    return;
  }

  process.stdout.write(
    `\nPASS ${results.length} of ${results.length} in ${took}\n`
  );
};

// Stopped by hand, or by whatever was reading the output going away: so is everything it started, each script's
//  whole group, and the bundles go with it.
const stop = (signal) => {
  running.forEach((child) => {
    try {
      process.kill(-child.pid, signal);
    } catch {
      // Gone already.
    }
  });
  discardBundles();
  process.exit(128 + os.constants.signals[signal]);
};

['SIGINT', 'SIGTERM'].forEach((signal) =>
  process.on(signal, () => stop(signal))
);
process.stdout.on('error', () => stop('SIGTERM'));

main().catch((error) => {
  discardBundles();
  process.stderr.write(`FAIL test-all: ${error.stack ?? error}\n`);
  process.exitCode = 1;
});
