const fs = require('fs');

const path = require('path');

const { manifestPath, webRenderer, workspaceRoot } = require('./paths');
const { installedPackages } = require('./scan');
const { waves } = require('./graph');

// Packages a stage introduces rather than finds. These cannot be derived from
// source — there is nothing in them to detect — and they publish first in their
// stage, because everything the stage touches comes to depend on them.
const INTRODUCED_BY = {
  'core-random': 2,
};

// `web-renderer/package.json` already declares which packages the app does not
// load. `civ1-asset-extractor` is renderer-side tooling that reads the original
// game's files, so its `Math.random` calls are not part of the engine's
// determinism and 05-engine-plan.md says to skip it.
const excluded = () => {
  try {
    return new Set(
      JSON.parse(fs.readFileSync(path.join(webRenderer, 'package.json'), 'utf8'))[
        'civ-clone'
      ].excludes
    );
  } catch (e) {
    return new Set();
  }
};

// Which stages touch a package, otherwise derived from what is actually in its
// source rather than hand-maintained. `05-engine-plan.md` defines the stages.
//
// Note that this reports stages with work *remaining*: once a stage lands, its
// packages drop out. The wave mapping for a completed stage lives in this
// file's git history, which is the honest place for it.
const stagesFor = (name, details, skip) => {
  if (skip.has(name)) {
    return [];
  }

  const stages = [];

  if (INTRODUCED_BY[name]) {
    stages.push(INTRODUCED_BY[name]);
  }

  if (details.source.fields > 0) {
    stages.push(1);
  }

  if (details.source.mathRandom > 0) {
    stages.push(2);
  }

  if (details.source.registerRules) {
    stages.push(3);
  }

  return [...new Set(stages)].sort();
};

const STAGES = [1, 2, 3];

const build = () => {
  const installed = installedPackages();
  const dependenciesOf = (name) =>
    installed[name] ? installed[name].dependencies : [];
  const stagesOf = {};
  const skip = excluded();

  Object.keys(installed).forEach((name) => {
    stagesOf[name] = stagesFor(name, installed[name], skip);
  });

  // Waves are per stage: a package's publish order depends on which other
  // packages *in that stage* it depends on. Computing them once over the stage 1
  // set left every stage 2 package with no wave at all once stage 1 landed.
  const waveFor = {};
  const waveCount = {};

  STAGES.forEach((stage) => {
    const members = Object.keys(installed).filter((name) =>
      stagesOf[name].includes(stage)
    );

    if (members.length === 0) {
      return;
    }

    const { wave } = waves(members, dependenciesOf);

    waveFor[stage] = wave;
    waveCount[stage] = Math.max(...members.map((name) => wave.get(name))) + 1;
  });

  const all = waves(Object.keys(installed), dependenciesOf);
  const packages = {};

  Object.keys(installed)
    .sort()
    .forEach((name) => {
      const details = installed[name];
      const stages = stagesOf[name];

      if (stages.length === 0) {
        return;
      }

      packages[name] = {
        waves: stages.reduce((map, stage) => {
          map[stage] = waveFor[stage] ? waveFor[stage].get(name) : null;

          return map;
        }, {}),
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
      remainingByStage: STAGES.reduce((map, stage) => {
        const members = Object.keys(installed).filter((name) =>
          stagesOf[name].includes(stage)
        );

        map[stage] = { packages: members.length, waves: waveCount[stage] ?? 0 };

        return map;
      }, {}),
      stage1Declarations: Object.values(installed).reduce(
        (total, details) => total + details.source.fields,
        0
      ),
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
  Object.entries(manifest.totals.remainingByStage).forEach(
    ([stage, { packages, waves: count }]) =>
      console.log(
        `stage ${stage} remaining    ${String(packages).padStart(3)} packages${count ? `, ${count} waves` : ''}${packages === 0 ? '  (complete)' : ''}`
      )
  );
  console.log(
    `#private declarations ${manifest.totals.stage1Declarations} remaining in shipped source`
  );
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
