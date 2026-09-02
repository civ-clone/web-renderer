const { execFileSync } = require('child_process');
const fs = require('fs');

const { checkoutPath } = require('./paths');
const { read } = require('./audit');
const { isDirty } = require('./clone');

const git = (dir, ...args) =>
  execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();

const npm = (dir, ...args) =>
  execFileSync('npm', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' });

// Every civ-clone repo is on `master`, not the `main` that
// 04-package-workflow.md assumes. Ask the remote rather than hardcoding either.
const defaultBranch = (dir) => {
  try {
    return git(dir, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD')
      .split('/')
      .pop();
  } catch (e) {
    return git(dir, 'rev-parse', '--abbrev-ref', 'HEAD');
  }
};

const hasScript = (dir, name) => {
  try {
    const manifest = JSON.parse(
      fs.readFileSync(checkoutPath(dir) + '/package.json', 'utf8')
    );

    return Boolean((manifest.scripts || {})[name]);
  } catch (e) {
    return false;
  }
};

// Steps 1-4 of the per-package procedure in 04-package-workflow.md. These are
// the checks; they never mutate anything outside the checkout.
const verify = (name) => {
  const dir = checkoutPath(name);
  const problems = [];

  if (!fs.existsSync(dir)) {
    return [`${name}: no checkout`];
  }

  if (isDirty(dir)) {
    problems.push(`${name}: working tree is dirty`);
  }

  const branch = git(dir, 'rev-parse', '--abbrev-ref', 'HEAD');
  const expected = defaultBranch(dir);

  if (branch !== expected) {
    problems.push(`${name}: on branch ${branch}, expected ${expected}`);
  }

  if (problems.length > 0) {
    return problems;
  }

  try {
    if (hasScript(name, 'ts:compile')) {
      npm(dir, 'run', 'ts:compile');
    }
  } catch (e) {
    problems.push(`${name}: ts:compile failed\n${e.stdout || e.message}`);
  }

  try {
    if (hasScript(name, 'prettier:format')) {
      npm(dir, 'run', 'prettier:format');

      if (isDirty(dir)) {
        problems.push(
          `${name}: prettier:format changed the tree — commit formatting first`
        );
      }
    }
  } catch (e) {
    problems.push(`${name}: prettier:format failed\n${e.stdout || e.message}`);
  }

  try {
    if (hasScript(name, 'test')) {
      npm(dir, 'test');
    }
  } catch (e) {
    problems.push(`${name}: tests failed\n${e.stdout || e.message}`);
  }

  return problems;
};

const release = (name, resolution) => {
  const dir = checkoutPath(name);

  npm(dir, 'version', 'patch');

  // The 22 GitHub-resolved packages are consumed straight from the default
  // branch, so pushing is the publish. Attempting `npm publish` on them would
  // fail on a name that was never registered.
  if (resolution !== 'github') {
    npm(dir, 'publish');
  }

  git(dir, 'push');
  git(dir, 'push', '--tags');

  return JSON.parse(fs.readFileSync(dir + '/package.json', 'utf8')).version;
};

const run = (args) => {
  const manifest = read();
  const waveIndex = args.indexOf('--wave');

  if (waveIndex === -1) {
    throw new Error('civ publish requires --wave N');
  }

  const wave = Number(args[waveIndex + 1]);
  const stageIndex = args.indexOf('--stage');
  const stage = stageIndex === -1 ? 1 : Number(args[stageIndex + 1]);
  const dryRun = args.includes('--dry-run');
  const packages = Object.entries(manifest.packages)
    .filter(
      ([, details]) => details.wave === wave && details.stages.includes(stage)
    )
    .map(([name, details]) => ({ name, ...details }));

  if (packages.length === 0) {
    throw new Error(`No stage ${stage} packages in wave ${wave}`);
  }

  // A cycle group is one publish unit: each member requires the others at a
  // version that only exists once all of them are out.
  const cycle = manifest.cycles.find((group) =>
    group.some((name) => packages.some((entry) => entry.name === name))
  );

  if (cycle && !cycle.every((name) => packages.some((e) => e.name === name))) {
    throw new Error(
      `Wave ${wave} contains part of the cycle group ${cycle.join(', ')}. ` +
        'Publish the group together or not at all.'
    );
  }

  console.log(
    `wave ${wave}, stage ${stage}: ${packages.map((entry) => entry.name).join(', ')}\n`
  );

  const problems = [];

  packages.forEach((entry) => {
    const found = verify(entry.name);

    console.log(
      `  ${entry.name.padEnd(42)} ${found.length === 0 ? 'ok' : 'FAILED'}`
    );
    problems.push(...found);
  });

  if (problems.length > 0) {
    console.log('\n' + problems.join('\n'));
    process.exitCode = 1;

    return;
  }

  if (dryRun) {
    console.log('\n--dry-run: would bump and publish');
    packages.forEach((entry) =>
      console.log(
        `  ${entry.name.padEnd(42)} ${entry.version} → patch  (${entry.resolution === 'github' ? 'git push only' : 'npm publish'})`
      )
    );

    return;
  }

  packages.forEach((entry) => {
    const version = release(entry.name, entry.resolution);

    console.log(`  ${entry.name.padEnd(42)} published ${version}`);
  });

  console.log(
    "\nNext: `pnpm update '@civ-clone/*'` in web-renderer, run the conformance " +
      'suite, smoke test, then commit pnpm-lock.yaml.'
  );
};

module.exports = { defaultBranch, run, verify };
