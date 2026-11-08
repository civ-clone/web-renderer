import { PlayerAction } from '../types';

// Which of the player's actions go to the primary panel (the end-turn area) and which to the secondary one. Pure, so
//  `Hud`'s `build` and the tests share it.

export const primaryActionList = [
    'ChooseGovernment',
    'ChooseResearch',
    'CityBuild',
    'CivilDisorder',
    'EndTurn',
    'Notice',
  ],
  // Handled elsewhere (the unit, the city screen), so on neither panel.
  ignoredActionList = [
    'ActiveUnit',
    'ChangeProduction',
    'ChangeSpecialist',
    'ChangeWorkedTile',
    'CompleteProduction',
    'InactiveUnit',
    'SellImprovement',
  ],
  primaryActionPriority: {
    [key: string]: number;
  } = {
    EndTurn: 100,
    ChooseGovernment: 90,
    ChooseResearch: 80,
    CityBuild: 60,
    CivilDisorder: 10,
    Notice: 5,
  };

const allExcludedActions = new Set([
  ...primaryActionList,
  ...ignoredActionList,
]);

/**
 * Splits `actions` (the player's) and `notices` (`Notices#actions`) into the two panels. `primary` is in ascending
 *  priority, so `EndTurn` comes last; `secondary` keeps the player's order and never holds notices.
 */
export const partitionActions = (
  actions: (PlayerAction | null | undefined)[],
  // A notice's value is a `Notice` (`components/Notices.ts`), which no player action holds: the panels take it as one
  //  all the same, and `Actions/Notice.ts` reads its value back as a `Notice`.
  notices: PlayerAction<unknown>[],
  waiting: boolean
): { primary: PlayerAction[]; secondary: PlayerAction[] } => {
  // Still last turn's actions while waiting, and the worker isn't
  // listening for them: End Turn would come back, clickable.
  const playerActions = waiting
      ? []
      : actions.filter((action): action is PlayerAction => !!action),
    primaryActionCandidates = [...playerActions, ...(notices as PlayerAction[])]
      .sort(
        (a, b) =>
          (primaryActionPriority[a._] ?? 0) - (primaryActionPriority[b._] ?? 0)
      )
      .filter((action) => primaryActionList.includes(action._));

  return {
    primary: primaryActionCandidates,
    secondary: playerActions.filter(
      (action) => !allExcludedActions.has(action._)
    ),
  };
};

export default partitionActions;
