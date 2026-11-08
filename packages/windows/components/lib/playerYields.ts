import { Player, Yield } from '@civ-clone/ui-protocol/types';

export const combinedYields = (player: Player) =>
  player.cities.reduce(
    (yields: Yield[], city) => yields.concat(city.yields),
    []
  );
