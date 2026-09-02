const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { checkoutPath, toolsDir } = require('./paths');
const { read } = require('./audit');
const { installedPath } = require('./sync');

const baselineDir = path.join(toolsDir, '.dts-baseline');

const declarationFiles = (dir, found = [], base = dir) => {
  let entries;

  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return found;
  }

  entries.forEach((entry) => {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!['node_modules', '.git', 'tests'].includes(entry.name)) {
        declarationFiles(fullPath, found, base);
      }

      return;
    }

    if (entry.name.endsWith('.d.ts')) {
      found.push(path.relative(base, fullPath));
    }
  });

  return found;
};

const snapshot = (names) => {
  fs.rmSync(baselineDir, { recursive: true, force: true });

  names.forEach((name) => {
    const from = installedPath(name);

    if (!from) {
      return;
    }

    declarationFiles(from).forEach((relative) => {
      const target = path.join(baselineDir, name, relative);

      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(from, relative), target);
    });
  });

  console.log(
    `baselined ${names.length} package(s) into ${path.relative(process.cwd(), baselineDir)}`
  );
};

// Stage 1 may add `private _x;` lines to a declaration file and remove the
// `#private;` placeholder they replace. Nothing else may change.
//
// Comparison is on normalised text, not lines: the baseline is the published
// `.d.ts`, and recompiling reformats (prettier rewraps `implements X {` across
// two lines) and re-emits under a different TypeScript (`export declare type`
// became `export type` in 5.x). Neither is a consumer-visible change, and
// comparing lines drowns the real signal in both.
const normalise = (text) =>
  text
    .split('\n')
    .filter(
      (line) =>
        !/^\s*((private|protected)\s+_[A-Za-z_$][\w$]*[;:].*|#private;)\s*$/.test(
          line
        )
    )
    .join('\n')
    .replace(/\bexport declare type\b/g, 'export type')
    // All whitespace, not merely collapsed: the published baselines were
    // formatted by a different prettier, so `{}` vs `{ }`, trailing commas in
    // import braces and every line wrap differ without meaning anything.
    .replace(/\s+/g, '')
    .replace(/,(?=[})\]>])/g, '');

// `protected` as well as `private`: three `Client` classes and
// `Interaction`/`Declaration` each declared the same `#private` name in one
// inheritance chain, which two `private` fields cannot express, so the base
// field is `protected` and the shadowing copies are gone.
const privateMembers = (text) =>
  (text.match(/^\s*(private|protected)\s+_[A-Za-z_$][\w$]*[;:].*$/gm) || [])
    .length;

// The published `.d.ts` in node_modules is the wrong baseline: each repo's
// `master` has moved on since it was published, so comparing against it mixes
// this stage's change with unrelated drift. The repos commit their `.d.ts`, so
// the commit before the refactor is an exact baseline.
const refactorParent = (dir) => {
  try {
    const commit = execFileSync(
      'git',
      ['log', '--format=%H', '-1', '--grep', '^refactor: use TypeScript private'],
      { cwd: dir, encoding: 'utf8' }
    ).trim();

    if (!commit) {
      return null;
    }

    return execFileSync('git', ['rev-parse', `${commit}^`], {
      cwd: dir,
      encoding: 'utf8',
    }).trim();
  } catch (e) {
    return null;
  }
};

const showAt = (dir, rev, relative) => {
  try {
    return execFileSync('git', ['show', `${rev}:${relative}`], {
      cwd: dir,
      encoding: 'utf8',
    });
  } catch (e) {
    return null;
  }
};

const compareGit = (names) => {
  const breaks = [];
  const skipped = [];

  names.forEach((name) => {
    const dir = checkoutPath(name);
    const parent = fs.existsSync(dir) ? refactorParent(dir) : null;

    if (!parent) {
      skipped.push(name);

      return;
    }

    let added = 0;
    const unexpected = [];

    declarationFiles(dir).forEach((relative) => {
      const before = showAt(dir, parent, relative);
      const after = fs.readFileSync(path.join(dir, relative), 'utf8');

      if (before === null) {
        unexpected.push(`+ ${relative} (new declaration file)`);

        return;
      }

      added += privateMembers(after) - privateMembers(before);

      if (normalise(before) === normalise(after)) {
        return;
      }

      unexpected.push(`~ ${relative}: ${firstDifference(before, after)}`);
    });

    console.log(
      `  ${name.padEnd(42)} ${String(added).padStart(3)} private member(s) added${unexpected.length ? `, ${unexpected.length} UNEXPECTED` : ''}`
    );

    unexpected.forEach((line) => console.log(`      ${line}`));

    if (unexpected.length > 0) {
      breaks.push(name);
    }
  });

  if (skipped.length > 0) {
    console.log(`\nno refactor commit found in: ${skipped.join(', ')}`);
  }

  if (breaks.length > 0) {
    console.log(`\nconsumer-visible changes in: ${breaks.join(', ')}`);
    process.exitCode = 1;

    return;
  }

  console.log(
    '\nNo consumer-visible break beyond added private and protected members.'
  );
};

const compare = (names) => {
  const breaks = [];

  names.forEach((name) => {
    const base = path.join(baselineDir, name);
    const current = checkoutPath(name);

    if (!fs.existsSync(base)) {
      console.log(`  ${name.padEnd(42)} no baseline`);

      return;
    }

    const relatives = new Set([
      ...declarationFiles(base),
      ...declarationFiles(current),
    ]);
    let added = 0;
    const unexpected = [];

    relatives.forEach((relative) => {
      const beforePath = path.join(base, relative);
      const afterPath = path.join(current, relative);

      if (!fs.existsSync(beforePath)) {
        unexpected.push(`+ ${relative} (new declaration file)`);

        return;
      }

      if (!fs.existsSync(afterPath)) {
        unexpected.push(`- ${relative} (declaration file gone)`);

        return;
      }

      const before = fs.readFileSync(beforePath, 'utf8');
      const after = fs.readFileSync(afterPath, 'utf8');

      added += privateMembers(after) - privateMembers(before);

      if (normalise(before) === normalise(after)) {
        return;
      }

      unexpected.push(`~ ${relative}: ${firstDifference(before, after)}`);
    });

    console.log(
      `  ${name.padEnd(42)} ${String(added).padStart(3)} private member(s) added${unexpected.length ? `, ${unexpected.length} UNEXPECTED` : ''}`
    );

    unexpected.forEach((line) => console.log(`      ${line}`));

    if (unexpected.length > 0) {
      breaks.push(name);
    }
  });

  if (breaks.length > 0) {
    console.log(`\nconsumer-visible changes in: ${breaks.join(', ')}`);
    process.exitCode = 1;

    return;
  }

  console.log('\nNo consumer-visible break beyond added private members.');
};

// Enough context to judge the change without printing two whole files.
const firstDifference = (before, after) => {
  const a = normalise(before);
  const b = normalise(after);
  let i = 0;

  while (i < a.length && i < b.length && a[i] === b[i]) {
    i += 1;
  }

  const from = Math.max(0, i - 30);

  return `…${a.slice(from, i + 60)}… became …${b.slice(from, i + 60)}…`;
};

const run = (args) => {
  const manifest = read();
  const names = args.filter((arg) => !arg.startsWith('--'));
  const targets =
    names.length > 0
      ? names
      : Object.entries(manifest.packages)
          .filter(([, details]) => details.stages.includes(1))
          .map(([name]) => name);

  if (args.includes('--baseline')) {
    snapshot(targets);

    return;
  }

  // `--published` compares against the snapshot of what is on npm, which also
  // shows drift between the registry and each repo's master. The default
  // compares against the commit before the refactor, which isolates this stage.
  if (args.includes('--published')) {
    compare(targets);

    return;
  }

  compareGit(targets);
};

module.exports = { baselineDir, run };
