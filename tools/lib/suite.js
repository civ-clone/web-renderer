// Runs one test suite: `tests/<kind>/<name>.ts`, bundled with esbuild so each
// package's `.ts` is resolved rather than its compiled `.js`, then run in its
// own node process, once per run.
//
// Exit 0 is not enough to pass (#473). The engine suites start their checks on
// `turnStarted`, so a game that never reaches the human's turn — a turn-loop
// deadlock, or a `plugins.ts` with nothing in it — drains the event loop and
// exits 0 having printed nothing. A run passes only if it also prints a line
// starting `PASS` (or `UPDATED`, when it rewrites its fixture), and finishes
// inside the timeout.
//
// An engine suite regenerates `src/js/plugins.ts` first, so `npm run test:x`
// plays with what is installed now, not with whatever an earlier step left.
// The bundle's temporary directory is removed afterwards.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { webRenderer } = require('./paths');

const DEFAULT_TIMEOUT = 5 * 60 * 1000;

const passLine = /^(?:PASS|UPDATED)\b/m;

const kebab = (name) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

const regeneratePlugins = () => {
  try {
    execFileSync(process.execPath, ['buildPluginList.js'], {
      cwd: webRenderer,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (error) {
    process.stdout.write(error.stdout || '');
    process.stderr.write(error.stderr || '');
    process.stderr.write('FAIL could not generate src/js/plugins.ts\n');
    process.exit(1);
  }
};

// The options each kind of suite is bundled with. The UI suites load the
// game's icons as its own build does, and linkedom reaches for the optional
// native `canvas` package, and copes without it.
const bundleOptions = (kind) =>
  kind === 'ui'
    ? {
        loader: { '.png': 'dataurl', '.svg': 'dataurl' },
        external: ['canvas'],
      }
    : {};

const bundle = async (kind, name, { esbuild = {}, entryPoint } = {}) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `${kebab(name)}-`)),
    outfile = path.join(directory, `${name}.js`);

  await require('esbuild').build({
    entryPoints: [
      entryPoint ?? path.join(webRenderer, 'tests', kind, `${name}.ts`),
    ],
    bundle: true,
    keepNames: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    outfile,
    logLevel: 'error',
    ...bundleOptions(kind),
    ...esbuild,
  });

  return { directory, outfile };
};

// One process. True when it exited 0 and printed a `PASS` line in time.
const runOnce = (
  outfile,
  { args = [], env = process.env, label, timeout = DEFAULT_TIMEOUT }
) => {
  const prefix = label ? `${label}: ` : '';

  try {
    const stdout = execFileSync(process.execPath, [outfile, ...args], {
      cwd: webRenderer,
      encoding: 'utf8',
      env,
      maxBuffer: 256 * 1024 * 1024,
      timeout,
    });

    process.stdout.write(stdout);

    if (!passLine.test(stdout)) {
      process.stderr.write(
        `FAIL ${prefix}exited 0 without printing PASS: the suite never finished its checks\n`
      );

      return false;
    }

    return true;
  } catch (error) {
    // The suite's stderr has already reached ours as it ran.
    process.stdout.write(error.stdout || '');

    if (error.code === 'ETIMEDOUT' || error.signal === 'SIGTERM') {
      process.stderr.write(
        `FAIL ${prefix}timed out after ${Math.round(timeout / 1000)}s\n`
      );
    }

    return false;
  }
};

// Bundles the suite, runs it once per entry in `runs`, removes the bundle and
// exits: 0 if every run passed.
const runSuite = async (
  kind,
  name,
  { runs = [{}], esbuild, entryPoint } = {}
) => {
  if (kind === 'engine') {
    regeneratePlugins();
  }

  const { directory, outfile } = await bundle(kind, name, {
    esbuild,
    entryPoint,
  });

  const timeout = Number(process.env.SUITE_TIMEOUT_MS) || DEFAULT_TIMEOUT;

  let failed = [];

  try {
    failed = runs.filter((run) => {
      if (runs.length > 1 && run.label) {
        process.stdout.write(`${run.label}\n`);
      }

      return !runOnce(outfile, { timeout, ...run });
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }

  if (runs.length > 1) {
    process.stdout.write(
      `\n${runs.length - failed.length}/${runs.length} runs of ${name}` +
        (failed.length
          ? ` (failed: ${failed.map(({ label }) => label).join(', ')})`
          : '') +
        '\n'
    );
  }

  process.exit(failed.length > 0 ? 1 : 0);
};

module.exports = { bundle, passLine, regeneratePlugins, runOnce, runSuite };
