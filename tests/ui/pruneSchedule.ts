// When the object map is pruned (#344): `PruneSchedule`, as `GameState`'s
// update uses it. Checks the 5th-turn schedule (once per turn), the
// 1.5× growth since the last prune, and that neither prunes at 5,000 objects
// or fewer.

import PruneSchedule from '../../src/js/UI/lib/PruneSchedule';

const failures: string[] = [];
let checks = 0,
  finished = false;

const check = (description: string, passed: boolean): void => {
  checks++;

  if (!passed) {
    failures.push(description);
  }
};

// A suite that stops before its checks would otherwise exit 0 (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      `FAIL prune-schedule: stopped after ${checks} checks, before the end\n`
    );
    process.exitCode = 1;
  }
});

// The 5,000 floor.
{
  const schedule = new PruneSchedule(6000);

  check('not at 5,000 objects on a 5th turn', !schedule.due(5, 5000));
  check('at 5,001 objects on a 5th turn', schedule.due(5, 5001));
  check(
    'not under the floor, however much it grew',
    !new PruneSchedule(1000).due(3, 5000)
  );
  check('growth over the floor', new PruneSchedule(1000).due(3, 5001));
}

// Every 5th turn, once.
{
  const schedule = new PruneSchedule(6000);

  check('not on turn 0', !schedule.due(0, 6000));
  check('not on turn 4', !schedule.due(4, 6000));
  check('on turn 5', schedule.due(5, 6000));
  check('on turn 10', schedule.due(10, 6000));
  check('not on a negative turn', !schedule.due(-5, 6000));
  check('not on a NaN turn', !schedule.due(NaN, 6000));
  check('not on an infinite turn', !schedule.due(Infinity, 6000));

  schedule.pruned(5, 6000);

  check('not again on the turn it pruned', !schedule.due(5, 6000));
  check('on the next 5th turn', schedule.due(10, 6000));
  check('not between them', !schedule.due(7, 6000));
}

// Growth by more than half since the last prune, on any turn.
{
  const schedule = new PruneSchedule(6000);

  check('not at exactly 1.5×', !schedule.due(3, 9000));
  check('over 1.5×', schedule.due(3, 9001));

  // The baseline is the count the prune left.
  schedule.pruned(3, 5500);

  check('not at 1.5× the pruned count', !schedule.due(4, 8250));
  check('over 1.5× the pruned count', schedule.due(4, 8251));
  check(
    'growth again on the turn it pruned',
    schedule.due(3, 8251) && !schedule.due(3, 8250)
  );
}

// A growth prune on a 5th turn counts as that turn's prune.
{
  const schedule = new PruneSchedule(4000);

  check('growth on turn 5', schedule.due(5, 6001));

  schedule.pruned(5, 5200);

  check('not again on turn 5 without growth', !schedule.due(5, 6001));
  check('turn 10 still due', schedule.due(10, 5200));
}

// The baseline starts at the count it was made with.
{
  check(
    'the first growth check uses the starting count',
    !new PruneSchedule(4000).due(3, 6000) &&
      new PruneSchedule(4000).due(3, 6001)
  );
}

finished = true;

if (failures.length > 0) {
  process.stderr.write(
    `FAIL prune-schedule (${failures.length} of ${checks} checks)\n  ${failures
      .slice(0, 20)
      .join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS prune-schedule (${checks} checks)\n`);
