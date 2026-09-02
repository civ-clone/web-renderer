#!/usr/bin/env node

// Post-conversion sweep. `tools/stage1.js` reports a package whose `ts:compile`
// was already failing and carries on — correct, because a pre-existing breakage
// is not this stage's to fix — but the consequence is a commit whose `.js` and
// `.d.ts` no longer match its `.ts`. Publishing that would ship a package whose
// compiled entrypoint still uses WeakMap private fields.
//
// This finds them: every converted package whose compiled output still contains
// TypeScript's private-field helpers, or whose compiler is not even installed.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { checkoutPath, webRenderer } = require('./lib/paths');
const { read } = require('./lib/audit');
const { scanSource, sourceFiles } = require('./lib/scan');

const HELPERS = /__classPrivateFieldGet|__classPrivateFieldSet|new WeakMap\(\)/;

const compiledSiblings = (dir) =>
  sourceFiles(dir)
    .map((file) => file.replace(/\.ts$/, '.js'))
    .filter((file) => fs.existsSync(file));

const check = (name, notes) => {
  const dir = checkoutPath(name);
  const problems = [];

  if (!fs.existsSync(dir)) {
    return ['no checkout'];
  }

  if (scanSource(dir).fields > 0) {
    problems.push('still has #private instance fields');
  }

  const stale = compiledSiblings(dir).filter((file) =>
    HELPERS.test(fs.readFileSync(file, 'utf8'))
  );

  if (stale.length > 0) {
    problems.push(
      `${stale.length} compiled file(s) still use private-field helpers: ${stale
        .slice(0, 3)
        .map((file) => path.relative(dir, file))
        .join(', ')}`
    );
  }

  // `simple-ai-client` cannot be installed: it has around twenty `github:`
  // dependencies and npm spawns a nested install for each, recursively, until
  // the machine gives up. Its `node_modules` is symlinked to the renderer's
  // instead, so fall back to the renderer's own compiler rather than reporting
  // a package that is in fact fine.
  const local = fs.existsSync(path.join(dir, 'node_modules', '.bin', 'tsc'));
  const bin = (tool) =>
    local
      ? path.join(dir, 'node_modules', '.bin', tool)
      : path.join(webRenderer, 'node_modules', '.bin', tool);

  try {
    execFileSync(bin('tsc'), ['--build', 'tsconfig.json', '--force'], {
      cwd: dir,
      encoding: 'utf8',
      stdio: 'pipe',
    });

    // The committed `.d.ts` are prettier-formatted, so raw `tsc` output always
    // differs. Format before comparing, or every package looks stale.
    execFileSync(bin('prettier'), ['--config', '.prettierrc', '**/*.ts', '--write'], {
      cwd: dir,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (error) {
    const first = ((error.stdout || '') + (error.stderr || ''))
      .split('\n')
      .filter((line) => /error TS/.test(line))[0];

    problems.push(`ts:compile fails: ${first || (error.message || 'unknown error')}`);
  }

  // A `--force` rebuild reformats — the committed `.js` use single quotes and
  // current `tsc` emits double — so a diff here is not evidence of staleness on
  // its own. The private-field-helper test above is what actually catches a
  // commit whose compiled output predates its source. Report the diff, restore
  // the tree, and do not fail on it.
  const dirty = execGit(dir);

  if (dirty) {
    notes.push(`${dirty.split('\n').length} file(s) differ after a forced rebuild (formatting)`);
  }

  execFileSync('git', ['checkout', '--', '.'], { cwd: dir, stdio: 'pipe' });

  return problems;
};

const execGit = (dir) =>
  execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
    cwd: dir,
    encoding: 'utf8',
  }).trim();

const main = () => {
  const names = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const manifest = read();
  const targets =
    names.length > 0
      ? names
      : Object.entries(manifest.packages)
          .filter(([, details]) => details.stages.includes(1))
          .map(([name]) => name)
          .sort();
  const broken = [];

  targets.forEach((name) => {
    const notes = [];
    const problems = check(name, notes);

    if (problems.length === 0) {
      if (notes.length > 0 && process.env.VERBOSE) {
        console.log(`  ${name}`);
        notes.forEach((note) => console.log(`      note: ${note}`));
      }

      return;
    }

    broken.push(name);
    console.log(`  ${name}`);
    problems.forEach((problem) => console.log(`      ${problem}`));
    notes.forEach((note) => console.log(`      note: ${note}`));
  });

  console.log(
    `\n${targets.length} package(s) checked, ${broken.length} needing attention`
  );

  if (broken.length > 0) {
    process.exitCode = 1;
  }
};

main();
