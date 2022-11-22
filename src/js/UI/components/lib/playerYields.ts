import { Player, Yield } from '../../types';

export const combinedYields = (player: Player) =>
  player.cities.reduce(
    (yields: Yield[], city) => yields.concat(city.yields),
    []
  );
