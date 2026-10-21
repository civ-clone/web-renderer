// Whether one player has met another, for naming them in a notification or a report (#59), worked out from the
//  registries it is given so it can be checked with plain data.

import City from '@civ-clone/core-city/City';
import { CityRegistry } from '@civ-clone/core-city/CityRegistry';
import { InteractionRegistry } from '@civ-clone/core-diplomacy/InteractionRegistry';
import Player from '@civ-clone/core-player/Player';
import { PlayerWorldRegistry } from '@civ-clone/core-player-world/PlayerWorldRegistry';

export type HasMetDependencies = {
  interactions: Pick<InteractionRegistry, 'getByPlayers'>;
  cities: Pick<CityRegistry, 'entries'>;
  playerWorlds: Pick<PlayerWorldRegistry, 'getByPlayer'>;
};

// There is no formal first-contact record, so this stands in: any interaction between us (a negotiation or a
//  declaration), or having seen a city they hold or founded. The founder counts because a defeated player holds no
//  cities by the time we are told.
export const hasMet = (
  self: Player,
  other: Player,
  { interactions, cities, playerWorlds }: HasMetDependencies
): boolean => {
  if (other === self) {
    return true;
  }

  if (interactions.getByPlayers(self, other).length > 0) {
    return true;
  }

  const playerWorld = playerWorlds.getByPlayer(self);

  return cities
    .entries()
    .some(
      (city: City) =>
        (city.player() === other || city.originalPlayer() === other) &&
        playerWorld.getByTile(city.tile()) !== null
    );
};

export default hasMet;
