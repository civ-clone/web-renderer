// Civ1's revolution (#865), moved out of the worker client's player actions: a revolution starts Anarchy, and the new
//  government is chosen once it is over.

import { ChooseGovernment } from '@civ-clone/civ1-government/PlayerActions';
import {
  chooseGovernment,
  revolution,
} from '@civ-clone/civ1-government/lib/revolution';
import { ActionHandler } from '@civ-clone/ui-worker-client/Client/actions/ActionContext';
import PlayerGovernment from '@civ-clone/core-government/PlayerGovernment';
import { Revolution } from '@civ-clone/library-government/PlayerActions';

export const handleRevolution: ActionHandler<Revolution> = async (
  ctx,
  action,
  playerAction
) => {
  revolution(playerAction.value() as PlayerGovernment);

  ctx.patches.player();

  return false;
};

export const handleChooseGovernment: ActionHandler<ChooseGovernment> = async (
  ctx,
  action,
  playerAction
) => {
  const playerGovernment = playerAction.value() as PlayerGovernment,
    { chosen } = action,
    [GovernmentType] = playerGovernment
      .available()
      .filter((GovernmentType) => GovernmentType.name === chosen);

  if (!GovernmentType) {
    console.error(`Government type: '${chosen}' not found.`);

    return false;
  }

  chooseGovernment(playerGovernment, GovernmentType);

  ctx.patches.player();

  return false;
};
