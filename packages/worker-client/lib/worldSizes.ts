// The world sizes the rules offer a new game (#1175), as the page takes them: from core-world-generator's
//  `WorldSizeRegistry`, which a ruleset fills (civ2-world, with Civ2's sizes). Rules that fill none (Civ1's) leave the
//  page offering its own.

import {
  WorldSizeRegistry,
  instance as worldSizeRegistryInstance,
} from '@civ-clone/core-world-generator/WorldSizeRegistry';
import { WorldSizesAnswer } from '@civ-clone/ui-protocol/Requests/WorldSizes';

export const worldSizesData = (
  worldSizeRegistry: WorldSizeRegistry = worldSizeRegistryInstance
): WorldSizesAnswer => {
  const custom = worldSizeRegistry.customLimits();

  return {
    sizes: worldSizeRegistry.entries().map((size) => ({
      key: size.key(),
      topologyId: size.topologyId(),
      width: size.width(),
      height: size.height(),
      minPlayers: size.minPlayers(),
      maxPlayers: size.maxPlayers(),
      players: size.players(),
      earth: size.earth(),
    })),
    custom: custom === null ? null : { ...custom },
  };
};

export default worldSizesData;
