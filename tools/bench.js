#!/usr/bin/env node

// How long a headless game takes, and where the time goes.
//
// Stage 7 is the only stage whose acceptance is a number, so the number needs
// somewhere to come from: this runs the conformance harness over a longer game
// and reports wall time, optionally with a CPU profile summarised by self time.
//
//   node tools/bench.js --turns 150
//   node tools/bench.js --turns 60 --profile
//
// `--profile` exists because the first guess was wrong. The plan expected
// `getByPlayer`/`getByTile` to dominate; a profile put 23% of a 150-turn game
// in `TransportRegistry.getByUnit`, answering "is this unit aboard anything"
// by scanning every manifest and throwing a `TypeError` when the answer was no.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { webRenderer } = require('./lib/paths');

const argument = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);

  return index === -1 ? fallback : process.argv[index + 1];
};

const turns = Number(argument('turns', 150));
const profiling = process.argv.includes('--profile');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-'));
const bundle = path.join(directory, 'run.js');

require('esbuild').buildSync({
  entryPoints: [path.join(webRenderer, 'tests', 'engine', 'run.ts')],
  bundle: true,
  keepNames: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile: bundle,
  logLevel: 'error',
});

// `run.ts` ends with `process.exit`, which skips node's own `--cpu-prof`
// writer, so the profile is stopped and written from inside an overridden exit.
const profiler = path.join(directory, 'profile.js');
const profileOut = path.join(directory, 'run.cpuprofile');

fs.writeFileSync(
  profiler,
  `const fs = require('fs');
const inspector = require('inspector');
const session = new inspector.Session();

session.connect();
session.post('Profiler.enable', () =>
  session.post('Profiler.start', () => {
    const exit = process.exit.bind(process);

    process.exit = (code) =>
      session.post('Profiler.stop', (error, { profile }) => {
        fs.writeFileSync(${JSON.stringify(
          profileOut
        )}, JSON.stringify(profile));
        exit(code);
      });

    require(${JSON.stringify(bundle)});
  })
);`
);

const started = Date.now();

execFileSync(process.execPath, profiling ? [profiler] : [bundle], {
  cwd: webRenderer,
  encoding: 'utf8',
  maxBuffer: 256 * 1024 * 1024,
  env: {
    ...process.env,
    CONFORMANCE_CONFIG: JSON.stringify({
      turns,
      checkpoints: [turns],
    }),
  },
  stdio: ['ignore', 'pipe', 'inherit'],
});

const elapsed = (Date.now() - started) / 1000;

console.log(
  `${turns} turns in ${elapsed.toFixed(1)}s — ${(elapsed / turns).toFixed(
    3
  )}s/turn`
);

if (!profiling) {
  fs.rmSync(directory, { recursive: true, force: true });

  return;
}

// Self time per function, and anonymous frames named by their caller: a
// criterion is an arrow function, so `(anonymous)` on its own says nothing.
const profile = JSON.parse(fs.readFileSync(profileOut, 'utf8'));
const byId = new Map(profile.nodes.map((node) => [node.id, node]));
const parent = new Map();

profile.nodes.forEach((node) =>
  (node.children ?? []).forEach((child) => parent.set(child, node.id))
);

const self = new Map();

profile.samples.forEach((id, index) => {
  const node = byId.get(id);

  if (!node) {
    return;
  }

  const caller = byId.get(parent.get(id))?.callFrame;
  const { functionName, lineNumber } = node.callFrame;
  const key = `${functionName || '(anonymous)'}@${lineNumber}${
    caller
      ? `  <- ${caller.functionName || '(anonymous)'}@${caller.lineNumber}`
      : ''
  }`;

  self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[index] ?? 0));
});

const total = [...self.values()].reduce((sum, time) => sum + time, 0);

console.log(`\nself time (bundle: ${bundle}):`);

[...self.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)
  .forEach(([name, time]) =>
    console.log(
      `  ${((time / total) * 100).toFixed(1).padStart(5)}%  ${(time / 1000)
        .toFixed(0)
        .padStart(6)}ms  ${name}`
    )
  );

console.log(`\nthe bundle is kept for line lookups: ${directory}`);
