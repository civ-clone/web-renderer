// Which of the player's actions reach the primary and secondary panels (#344):
// `partitionActions`, as `Renderer`'s `render()` calls it. Checks the priority
// order of the primary panel, that the secondary panel holds only what neither
// list names, that the ignored actions reach neither, that waiting empties the
// player's actions but not the notices, and that a missing action is skipped.

import partitionActions, {
  ignoredActionList,
  primaryActionList,
} from '../../src/js/UI/lib/playerActionPanels';
import { PlayerAction } from '../../src/js/UI/types';

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
      `FAIL player-action-panels: stopped after ${checks} checks, before the end\n`
    );
    process.exitCode = 1;
  }
});

const action = (_: string, id: string = _): PlayerAction =>
    ({ _, id, value: null } as unknown as PlayerAction),
  ids = (actions: PlayerAction[]): string => actions.map(({ id }) => id).join();

// The priority order: ascending, so End Turn is last and notices first.
{
  const { primary, secondary } = partitionActions(
    [
      action('EndTurn'),
      action('CityBuild'),
      action('ChooseGovernment'),
      action('CivilDisorder'),
      action('ChooseResearch'),
    ],
    [action('Notice')],
    false
  );

  check(
    `primary is in ascending priority (${ids(primary)})`,
    ids(primary) ===
      'Notice,CivilDisorder,CityBuild,ChooseResearch,ChooseGovernment,EndTurn'
  );
  check(
    `nothing on the primary list reaches secondary (${ids(secondary)})`,
    secondary.length === 0
  );
}

// Equal priorities keep the order they came in, the player's before the notices.
{
  const { primary } = partitionActions(
    [
      action('CityBuild', 'build-a'),
      action('Notice', 'notice-player'),
      action('CityBuild', 'build-b'),
    ],
    [action('Notice', 'notice-0'), action('Notice', 'notice-1')],
    false
  );

  check(
    `equal priorities keep their order (${ids(primary)})`,
    ids(primary) === 'notice-player,notice-0,notice-1,build-a,build-b'
  );
}

// Secondary: what neither list names, in the player's order; never notices.
{
  const { primary, secondary } = partitionActions(
    [
      action('Revolution'),
      action('EndTurn'),
      ...ignoredActionList.map((name) => action(name)),
      action('AdjustTradeRates'),
    ],
    [action('Notice')],
    false
  );

  check(
    `secondary holds the unlisted actions in order (${ids(secondary)})`,
    ids(secondary) === 'Revolution,AdjustTradeRates'
  );
  check(
    `unlisted actions are not primary (${ids(primary)})`,
    ids(primary) === 'Notice,EndTurn'
  );

  for (const name of ignoredActionList) {
    check(
      `${name} reaches neither panel`,
      !primary.some(({ _ }) => _ === name) &&
        !secondary.some(({ _ }) => _ === name)
    );
  }
}

// The lists, as `render()` had them.
check(
  `the primary list (${primaryActionList.join()})`,
  primaryActionList.join() ===
    'ChooseGovernment,ChooseResearch,CityBuild,CivilDisorder,EndTurn,Notice'
);
check(
  `the ignored list (${ignoredActionList.join()})`,
  ignoredActionList.join() ===
    'ActiveUnit,ChangeProduction,ChangeSpecialist,ChangeWorkedTile,CompleteProduction,InactiveUnit,SellImprovement'
);

// Waiting: last turn's actions are dropped from both panels; the notices stay.
{
  const { primary, secondary } = partitionActions(
    [action('EndTurn'), action('CityBuild'), action('Revolution')],
    [action('Notice', 'notice-0')],
    true
  );

  check(
    `waiting leaves only the notices on primary (${ids(primary)})`,
    ids(primary) === 'notice-0'
  );
  check(
    `waiting empties secondary (${ids(secondary)})`,
    secondary.length === 0
  );

  const empty = partitionActions([action('EndTurn')], [], true);

  check(
    'waiting with no notices empties both',
    empty.primary.length === 0 && empty.secondary.length === 0
  );
}

// A missing action (a ref not filled yet) is skipped.
{
  const { primary, secondary } = partitionActions(
    [null, action('EndTurn'), undefined, action('Revolution')],
    [],
    false
  );

  check(
    `missing actions are skipped (${ids(primary)} / ${ids(secondary)})`,
    ids(primary) === 'EndTurn' && ids(secondary) === 'Revolution'
  );
}

finished = true;

if (failures.length > 0) {
  process.stderr.write(
    `FAIL player-action-panels (${
      failures.length
    } of ${checks} checks)\n  ${failures.slice(0, 20).join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS player-action-panels (${checks} checks)\n`);
