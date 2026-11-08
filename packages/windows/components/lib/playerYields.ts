import { Player, Yield } from '@civ-clone/ui-client/types';

export const combinedYields = (player: Player) =>
  player.cities.reduce(
    (yields: Yield[], city) => yields.concat(city.yields),
    []
  );
