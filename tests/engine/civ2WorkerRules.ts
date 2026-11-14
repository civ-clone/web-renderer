// Civ2's worker rules dispatch Civ2's revolution (M2a, #1008): with civ2-government's rules loaded and
//  `@civ-clone/ui-rules-civ1` never imported, the client's own `handleAction` finds the player's Revolution and Choose
//  Government actions and acts on them through rules-civ2's handlers. A Revolution puts the player into Anarchy,
//  pending under civ2-government's key and none of Civ1's. Choose Government is offered only on civ2's schedule (the
//  next turn that is a multiple of 4, civ2-government's `AnarchyDuration`), and choosing then ends the Anarchy.
//  `clientHandleAction.ts` checks the handler table with Civ1's rules; this is Civ2's.

// civ2-government registers its governments, availability, Anarchy duration and player actions on the shared
//  registries as it is imported, as the civ2 set loads it.
import '@civ-clone/civ2-government';
import {
  REVOLUTION,
  pendingRevolution,
  turnsUntilChoice,
} from '@civ-clone/civ2-government/lib/revolution';
import civ2Rules from '@civ-clone/ui-rules-civ2';
import {
  handleChooseGovernment,
  handleRevolution,
} from '@civ-clone/ui-rules-civ2/actions/government';
import {
  actionHandlers,
  handleAction,
} from '@civ-clone/ui-worker-client/Client/handleAction';
import ChooseGovernment from '@civ-clone/base-player-action-choose-government/ChooseGovernment';
import { Monarchy as MonarchyAdvance } from '@civ-clone/base-science-advance-monarchy/Monarchy';
import Player from '@civ-clone/core-player/Player';
import PlayerAction from '@civ-clone/core-player/PlayerAction';
import PlayerResearch from '@civ-clone/core-science/PlayerResearch';
import Revolution from '@civ-clone/base-player-action-revolution/Revolution';
import { instance as pendingEffectRegistryInstance } from '@civ-clone/core-pending-effect';
import { instance as playerGovernmentRegistryInstance } from '@civ-clone/core-government/PlayerGovernmentRegistry';
import { instance as playerResearchRegistryInstance } from '@civ-clone/core-science/PlayerResearchRegistry';
import { instance as ruleRegistryInstance } from '@civ-clone/core-rule/RuleRegistry';
import { instance as turnInstance } from '@civ-clone/core-turn-based-game/Turn';

const failures: string[] = [];
let checks = 0,
  finished = false;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${description}\n    expected: ${JSON.stringify(
        expected
      )}\n    actual:   ${JSON.stringify(actual)}`
    );
  }
};

// A run that stops before it reports has checked nothing (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      'FAIL civ2WorkerRules: stopped before the checks ran\n'
    );
    process.exitCode = 1;
  }
});

const run = async (): Promise<void> => {
  // Civ2's own start: a new player gets Despotism from civ2-government's `Added` rule.
  const player = new Player(ruleRegistryInstance),
    research = new PlayerResearch(player);

  playerResearchRegistryInstance.register(research);
  research.addAdvance(MonarchyAdvance);

  const playerGovernment = playerGovernmentRegistryInstance.getByPlayer(player),
    patched: string[] = [],
    ctx: any = {
      player: () => player,
      patches: { player: () => patched.push('player') },
      talks: { underWay: false, pending: Promise.resolve() },
    },
    offered = (): string[] =>
      player
        .actions()
        .filter(
          (action: PlayerAction): boolean =>
            action instanceof Revolution || action instanceof ChooseGovernment
        )
        .map((action: PlayerAction): string => action.constructor.name),
    governmentName = (): string | null =>
      playerGovernment.current()?.constructor.name ?? null,
    // The pending revolutions on the shared registry, by key: civ2-government's, and Civ1's spelled out, as nothing
    //  here may import civ1-government.
    pendingKeys = (): string[] =>
      pendingEffectRegistryInstance
        .entries()
        .filter(
          (effect: any): boolean => effect.target?.() === playerGovernment
        )
        .map((effect: any): string => effect.handler());

  expect(
    "rules-civ2's table acts on Revolution and Choose Government with its own handlers",
    civ2Rules.actionHandlers
      .filter(
        ([ActionType]) =>
          ActionType === Revolution || ActionType === ChooseGovernment
      )
      .map(([ActionType, handler]) => [ActionType.name, handler.name]),
    [
      ['Revolution', handleRevolution.name],
      ['ChooseGovernment', handleChooseGovernment.name],
    ]
  );
  expect(
    'and the client takes them from it, after the shared ones',
    actionHandlers()
      .filter(
        ([ActionType]) =>
          ActionType === Revolution || ActionType === ChooseGovernment
      )
      .map(
        ([, handler]) =>
          handler === handleRevolution || handler === handleChooseGovernment
      ),
    [true, true]
  );

  turnInstance.set(5);

  expect(
    'a new player is under Despotism, and offered a Revolution only',
    [governmentName(), offered()],
    ['Despotism', ['Revolution']]
  );

  const revolutionTaken = await handleAction(ctx, {
    name: 'Revolution',
    id: playerGovernment.id(),
  });

  expect(
    'the Revolution, dispatched by name, puts the player into Anarchy and tells the UI',
    [revolutionTaken, governmentName(), patched],
    [false, 'Anarchy', ['player']]
  );
  expect(
    "pending under civ2-government's key, and no other",
    [REVOLUTION, pendingKeys()],
    ['civ2-government:revolution', ['civ2-government:revolution']]
  );
  expect(
    'and civ2-government finds it',
    pendingRevolution(playerGovernment) !== null,
    true
  );
  expect(
    "on civ2's schedule: Anarchy to the next turn that is a multiple of 4, 3 turns from turn 5",
    turnsUntilChoice(playerGovernment),
    3
  );

  const schedule: [number, string[], number | null][] = [];

  for (const turn of [5, 6, 7, 8]) {
    turnInstance.set(turn);
    schedule.push([turn, offered(), turnsUntilChoice(playerGovernment)]);
  }

  expect(
    'Choose Government is offered only once the Anarchy is over, at turn 8, and no Revolution while it lasts',
    schedule,
    [
      [5, [], 3],
      [6, [], 2],
      [7, [], 1],
      [8, ['ChooseGovernment'], 0],
    ]
  );

  const tooEarly: string[] = [];

  turnInstance.set(7);
  // The client logs that the player has no such action; that is the answer checked here.
  const log = console.log;

  console.log = (): void => {};
  tooEarly.push(
    String(
      await handleAction(ctx, {
        name: 'ChooseGovernment',
        id: playerGovernment.id(),
        chosen: 'Monarchy',
      })
    ),
    String(governmentName())
  );
  console.log = log;
  expect(
    'before then, choosing is not an action the player has, and changes nothing',
    tooEarly,
    ['false', 'Anarchy']
  );

  turnInstance.set(8);
  patched.length = 0;

  const chosen = await handleAction(ctx, {
    name: 'ChooseGovernment',
    id: playerGovernment.id(),
    chosen: 'Monarchy',
  });

  expect(
    'at turn 8, Choose Government, dispatched by name, ends the Anarchy with the government chosen',
    [chosen, governmentName(), patched],
    [false, 'Monarchy', ['player']]
  );
  expect(
    'and leaves nothing pending, and a Revolution on offer again',
    [pendingKeys(), turnsUntilChoice(playerGovernment), offered()],
    [[], null, ['Revolution']]
  );

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL civ2WorkerRules (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS civ2WorkerRules (${checks} checks)\n`);
  process.exit(0);
};

run().catch((error: unknown): void => {
  process.stderr.write(
    `FAIL civ2WorkerRules: ${
      error instanceof Error ? error.stack : String(error)
    }\n`
  );
  process.exit(1);
});
