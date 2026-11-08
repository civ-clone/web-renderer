import {
  AdditionalDataRegistry,
  instance as additionalDataRegistryInstance,
} from '@civ-clone/core-data-object/AdditionalDataRegistry';
import Player from '@civ-clone/core-player/Player';
import playerStandIn from './playerStandIn';

export const omittedActions = ['actions', 'mandatoryActions'];

const standIns: WeakMap<Player, Player> = new WeakMap();

// The player serialises as a stand-in without `actions` and `mandatoryActions` (#411), which go on their own, after
//  it, so that an action the frontend already holds goes as a ref (`Client/PlayerPatches.ts` `actions`). In full, every
//  one of them went again with a new id, hundreds in a large game. See `playerStandIn`.
export const playerWithoutActions = (
  player: Player,
  additionalDataRegistry: AdditionalDataRegistry = additionalDataRegistryInstance
): Player => {
  const existing = standIns.get(player);

  if (existing) {
    return existing;
  }

  const standIn = playerStandIn(
    player,
    { omit: omittedActions },
    additionalDataRegistry
  );

  standIns.set(player, standIn);

  return standIn;
};

export default playerWithoutActions;
