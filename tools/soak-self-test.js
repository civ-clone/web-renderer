#!/usr/bin/env node

// `tools/soak.js` plays the games it is asked for and reports them truthfully (civ-clone/web-renderer#1008): Civ1's
// rules with players that only end their turns, to a fixed turn and to the game's end, and a game whose set registers
// a forbidden rule id fails.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const soak = path.join(__dirname, 'soak.js'),
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'soak-self-test-')),
  failures = [];

const expect = (description, actual, expected) => {
  if (actual !== expected) {
    failures.push(
      `${description}: expected ${JSON.stringify(
        expected
      )}, got ${JSON.stringify(actual)}`
    );
  }
};

// One soak, its exit code and its JSON report.
const run = (name, args) => {
  const json = path.join(directory, `${name}.json`);
  let code = 0,
    output = '';

  try {
    output = execFileSync(process.execPath, [soak, ...args, '--json', json], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    code = error.status;
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }

  if (!fs.existsSync(json)) {
    failures.push(`${name}: wrote no report (exit ${code})\n${output}`);

    return { code, games: [] };
  }

  return { code, games: JSON.parse(fs.readFileSync(json, 'utf8')).games };
};

const fixed = run('fixed', [
  '--set',
  'civ1',
  '--clients',
  'end-turn',
  '--games',
  '2',
  '--turns',
  '20',
]);

expect('fixed: exit code', fixed.code, 0);
expect('fixed: games', fixed.games.length, 2);
fixed.games.forEach(({ seed, run: report, problems }) => {
  const label = `fixed, seed ${seed}`;

  expect(`${label}: problems`, problems.length, 0);
  expect(`${label}: set`, report?.set, 'civ1');
  expect(`${label}: grid`, report?.grid, 'square');
  expect(`${label}: clients`, report?.clients, 'end-turn');
  expect(`${label}: end reason`, report?.endReason, 'turns');
  expect(`${label}: ending`, report?.ending, null);
  expect(`${label}: last turn`, report?.turn, 20);
  expect(`${label}: turns played`, report?.turnsPlayed, 19);
  // 4000 BC, then twenty years a turn.
  expect(`${label}: year`, report?.year, -3620);
  expect(
    `${label}: ms per turn is a positive number`,
    typeof report?.msPerTurn === 'number' && report.msPerTurn > 0,
    true
  );
  expect(`${label}: errors`, report?.errors, 0);
  expect(`${label}: rules loaded`, (report?.isolation.rules ?? 0) > 100, true);
  expect(`${label}: forbidden`, report?.isolation.forbidden.length, 0);
});

// With nobody to keep playing, a game that has ended carries on, and the run stops at the next turn.
const ended = run('ended', [
  '--set',
  'civ1',
  '--clients',
  'end-turn',
  '--games',
  '1',
  '--until-game-over',
]);

expect('ended: exit code', ended.code, 0);
ended.games.forEach(({ run: report, problems }) => {
  expect('ended: problems', problems.length, 0);
  expect('ended: end reason', report?.endReason, 'game-over');
  // Nobody builds anything, so only the date can end it.
  expect('ended: ending', report?.ending?.reason, 'date');
  expect(
    'ended: the run stops the turn after the ending',
    report?.turn,
    (report?.ending?.turn ?? NaN) + 1
  );
  expect(
    'ended: the ending has a year',
    typeof report?.ending?.year === 'number' && report.ending.year > 1900,
    true
  );
});

const forbidden = run('forbidden', [
  '--set',
  'civ1',
  '--clients',
  'end-turn',
  '--games',
  '1',
  '--turns',
  '5',
  '--forbid-prefix',
  'civ1-',
]);

expect('forbidden: exit code', forbidden.code, 1);
forbidden.games.forEach(({ run: report, problems }) => {
  expect('forbidden: end reason', report?.endReason, 'isolation');
  expect(
    'forbidden: civ1- rule ids found',
    (report?.isolation.forbidden ?? []).length > 0 &&
      report.isolation.forbidden.every((id) => id.startsWith('civ1-')),
    true
  );
  expect('forbidden: problems', problems.length, 1);
});

fs.rmSync(directory, { recursive: true, force: true });

if (failures.length > 0) {
  console.log(`FAIL soak self-test\n${failures.join('\n')}`);
  process.exit(1);
}

console.log('PASS soak self-test (fixed turns, until game over, isolation)');
