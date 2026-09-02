const fs = require('fs');

const { manifestPath, workspaceRoot } = require('./paths');
const { installedPackages } = require('./scan');
const { waves } = require('./graph');

// Which stages touch a package, derived from what is actually in its source
// rather than hand-maintained. `05-engine-plan.md` defines the stages.
const stagesFor = (details) => {
  const stages = [];

  if (details.source.fields > 0) {
    stages.push(1);
  }

  if (details.source.mathRandom > 0) {
    stages.push(2);
  }

  if (details.source.registerRules) {
    stages.push(3);
  }

  return stages;
};

const build = () => {
  const installed = installedPackages();
  const dependenciesOf = (name) =>
    installed[name] ? installed[name].dependencies : [];
  const stage1 = Object.values(installed)
    .filter((details) => details.source.fields > 0)
    .map((details) => details.name);
  const { wave, cycles } = waves(stage1, dependenciesOf);
  const all = waves(Object.keys(installed), dependenciesOf);
  const packages = {};

  Object.keys(installed)
    .sort()
    .forEach((name) => {
      const details = installed[name];
      const stages = stagesFor(details);

      if (stages.length === 0) {
        return;
      }

      packages[name] = {
        wave: wave.has(name) ? wave.get(name) : null,
        version: details.version,
        resolution: details.resolution,
        privateFields: details.source.fields,
        privateFieldFiles: details.source.files.sort(),
        mathRandom: details.source.mathRandom,
        registerRules: details.source.registerRules,
        stages,
      };
    });

  return {
    generatedBy: 'tools/civ audit --write',
    root: '~/Code/civ-clone',
    org: 'civ-clone',
    totals: {
      installed: Object.keys(installed).length,
      stage1Packages: stage1.length,
      stage1Declarations: stage1.reduce(
        (total, name) => total + installed[name].source.fields,
        0
      ),
      stage1Waves: Math.max(...stage1.map((name) => wave.get(name))) + 1,
      stage2Packages: Object.values(installed).filter(
        (details) => details.source.mathRandom > 0
      ).length,
      stage3Packages: Object.values(installed).filter(
        (details) => details.source.registerRules
      ).length,
      fromGitHub: Object.values(installed).filter(
        (details) => details.resolution === 'github'
      ).length,
    },
    cycles: all.cycles,
    packages,
  };
};

const read = () => {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    return null;
  }
};

const stagePackages = (stage) => {
  const manifest = read();

  if (!manifest) {
    throw new Error(
      'tools/packages.json is missing. Run `tools/civ audit --write` first.'
    );
  }

  return Object.entries(manifest.packages)
    .filter(([, details]) => stage == null || details.stages.includes(stage))
    .map(([name, details]) => ({ name, ...details }));
};

const run = (args) => {
  const manifest = build();
  const write = args.includes('--write');
  const existing = read();

  console.log(`root                ${workspaceRoot()}`);
  console.log(`installed           ${manifest.totals.installed}`);
  console.log(
    `from GitHub         ${manifest.totals.fromGitHub} (the rest from npm)`
  );
  console.log(
    `stage 1 surface     ${manifest.totals.stage1Packages} packages, ${manifest.totals.stage1Declarations} declarations, ${manifest.totals.stage1Waves} waves`
  );
  console.log(`stage 2 surface     ${manifest.totals.stage2Packages} packages`);
  console.log(`stage 3 surface     ${manifest.totals.stage3Packages} packages`);
  console.log(
    `cycles              ${manifest.cycles.length ? manifest.cycles.map((cycle) => cycle.join(' <-> ')).join('; ') : 'none'}`
  );

  if (existing) {
    const changed = Object.keys(manifest.packages).filter(
      (name) =>
        JSON.stringify(manifest.packages[name]) !==
        JSON.stringify(existing.packages[name])
    );
    const removed = Object.keys(existing.packages).filter(
      (name) => !manifest.packages[name]
    );

    if (changed.length === 0 && removed.length === 0) {
      console.log('\nmanifest            up to date');
    } else {
      console.log(
        `\nmanifest drift      ${changed.length} changed, ${removed.length} removed`
      );
      changed.forEach((name) => console.log(`  ~ ${name}`));
      removed.forEach((name) => console.log(`  - ${name}`));
    }
  }

  if (write) {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`\nwrote               ${manifestPath}`);

    return;
  }

  if (!existing) {
    console.log('\nNo manifest yet. Re-run with --write to create it.');
  }
};

module.exports = { build, read, run, stagePackages };
