const { execFileSync, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const { checkoutPath, workspaceRoot } = require('./paths');
const { read, stagePackages } = require('./audit');

const CONCURRENCY = 8;

const isDirty = (dir) =>
  execFileSync('git', ['status', '--porcelain'], {
    cwd: dir,
    encoding: 'utf8',
  }).trim() !== '';

const pool = (items, worker) =>
  new Promise((resolve) => {
    const results = [];
    let next = 0;
    let active = 0;

    const step = () => {
      if (next >= items.length && active === 0) {
        resolve(results);

        return;
      }

      while (active < CONCURRENCY && next < items.length) {
        const item = items[next];

        next += 1;
        active += 1;

        worker(item).then((result) => {
          results.push(result);
          active -= 1;
          step();
        });
      }
    };

    step();
  });

const cloneOne = (name, org) =>
  new Promise((resolve) => {
    const target = checkoutPath(name);

    execFile(
      'git',
      ['clone', '--quiet', `git@github.com:${org}/${name}.git`, target],
      (error, stdout, stderr) =>
        resolve({
          name,
          status: error ? 'failed' : 'cloned',
          message: error ? stderr.trim().split('\n').pop() : '',
        })
    );
  });

const run = async (args) => {
  const manifest = read();

  if (!manifest) {
    throw new Error(
      'tools/packages.json is missing. Run `tools/civ audit --write` first.'
    );
  }

  const stageIndex = args.indexOf('--stage');
  const stage = stageIndex === -1 ? null : Number(args[stageIndex + 1]);
  const packages = stagePackages(stage);
  const root = workspaceRoot();

  fs.mkdirSync(root, { recursive: true });

  const missing = [];
  const present = [];

  packages.forEach(({ name }) => {
    if (fs.existsSync(path.join(checkoutPath(name), '.git'))) {
      present.push(name);

      return;
    }

    missing.push(name);
  });

  console.log(
    `${packages.length} package(s)${stage == null ? '' : ` for stage ${stage}`}: ${present.length} present, ${missing.length} to clone`
  );

  const dirty = present.filter((name) => {
    try {
      return isDirty(checkoutPath(name));
    } catch (e) {
      return false;
    }
  });

  if (dirty.length > 0) {
    console.log(`\ndirty checkouts (${dirty.length}):`);
    dirty.forEach((name) => console.log(`  ! ${name}`));
  }

  if (missing.length === 0) {
    return;
  }

  if (args.includes('--dry-run')) {
    missing.forEach((name) => console.log(`  would clone ${name}`));

    return;
  }

  const results = await pool(missing, (name) => cloneOne(name, manifest.org));
  const failed = results.filter((result) => result.status === 'failed');

  console.log(`\ncloned ${results.length - failed.length}/${missing.length}`);

  failed.forEach((result) =>
    console.log(`  x ${result.name}: ${result.message}`)
  );

  if (failed.length > 0) {
    process.exitCode = 1;
  }
};

module.exports = { isDirty, run };
