// Civ2's revolution: a revolution starts Anarchy, and the new government is chosen once it is over (civ2-government's
//  `lib/revolution`, on base-government-change, with civ2-government's own save key and Anarchy).

import {
  chooseGovernment,
  revolution,
} from '@civ-clone/civ2-government/lib/revolution';
import { ActionHandler } from '@civ-clone/ui-worker-client/Client/actions/ActionContext';
import ChooseGovernment from '@civ-clone/base-player-action-choose-government/ChooseGovernment';
import PlayerGovernment from '@civ-clone/core-government/PlayerGovernment';
import Revolution from '@civ-clone/base-player-action-revolution/Revolution';

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
