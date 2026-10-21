// Whether the turn ends by itself after an update (#344): `shouldAutoEndTurn`,
// as `Renderer`'s `updateState` calls it. Checks each condition on its own: the
// `autoEndOfTurn` option, waiting for the other civilizations, End Turn being
// the one mandatory action, and the `autoEndOfTurnExceptions` option.

import shouldAutoEndTurn, {
  AutoEndTurnOptions,
} from '../../src/js/UI/lib/autoEndTurn';
import { Player, PlayerAction } from '../../src/js/UI/types';

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
      `FAIL auto-end-turn: stopped after ${checks} checks, before the end\n`
    );
    process.exitCode = 1;
  }
});

const action = (_: string): PlayerAction =>
    ({ _, id: _, value: null } as unknown as PlayerAction),
  player = (
    mandatory: string[],
    actions: string[] = mandatory
  ): Pick<Player, 'actions' | 'mandatoryActions'> => ({
    actions: actions.map(action),
    mandatoryActions: mandatory.map(action),
  }),
  // Like `GameOptionsRegistry#get`: the default when the option is not registered.
  optionsWith = (
    values: { [key: string]: any },
    asked: string[] = []
  ): AutoEndTurnOptions => ({
    get: (key: string, defaultValue: any = null): any => {
      asked.push(key);

      return key in values ? values[key] : defaultValue;
    },
  }),
  on = optionsWith({ autoEndOfTurn: true });

check(
  'ends the turn when End Turn is all that is left',
  !!shouldAutoEndTurn(player(['EndTurn'], ['EndTurn', 'Revolution']), on, false)
);
check('not while waiting', !shouldAutoEndTurn(player(['EndTurn']), on, true));
check(
  'not with the option off',
  !shouldAutoEndTurn(
    player(['EndTurn']),
    optionsWith({ autoEndOfTurn: false }),
    false
  )
);
check(
  'not with the option unset',
  !shouldAutoEndTurn(player(['EndTurn']), optionsWith({}), false)
);
check(
  'not with no mandatory action',
  !shouldAutoEndTurn(player([], ['EndTurn']), on, false)
);
check(
  'not with another mandatory action alongside End Turn',
  !shouldAutoEndTurn(player(['ChooseResearch', 'EndTurn']), on, false)
);
check(
  'not with two End Turns',
  !shouldAutoEndTurn(player(['EndTurn', 'EndTurn']), on, false)
);
check(
  'not when the one mandatory action is not End Turn',
  !shouldAutoEndTurn(player(['CityBuild']), on, false)
);
check(
  'not when an action is on the exceptions list',
  !shouldAutoEndTurn(
    player(['EndTurn'], ['EndTurn', 'ActiveUnit']),
    optionsWith({
      autoEndOfTurn: true,
      autoEndOfTurnExceptions: ['ActiveUnit'],
    }),
    false
  )
);
check(
  'ends the turn when no action is on the exceptions list',
  !!shouldAutoEndTurn(
    player(['EndTurn'], ['EndTurn', 'Revolution']),
    optionsWith({
      autoEndOfTurn: true,
      autoEndOfTurnExceptions: ['ActiveUnit'],
    }),
    false
  )
);
check(
  'the exceptions are checked against the actions, not the mandatory ones',
  !!shouldAutoEndTurn(
    player(['EndTurn'], ['Revolution']),
    optionsWith({
      autoEndOfTurn: true,
      autoEndOfTurnExceptions: ['EndTurn'],
    }),
    false
  )
);

// The exceptions are read first, whatever else decides it, as `updateState` did.
{
  const asked: string[] = [];

  shouldAutoEndTurn(player(['EndTurn']), optionsWith({}, asked), true);

  check(
    `the options read while waiting (${asked.join()})`,
    asked.join() === 'autoEndOfTurnExceptions'
  );
}

finished = true;

if (failures.length > 0) {
  process.stderr.write(
    `FAIL auto-end-turn (${failures.length} of ${checks} checks)\n  ${failures
      .slice(0, 20)
      .join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS auto-end-turn (${checks} checks)\n`);
