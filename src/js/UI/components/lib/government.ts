import { Player } from '../../types';

// Under Anarchy a city still shows the gold and research it makes, but none of it reaches the treasury or the research
// under way, and no upkeep is paid.
export const isAnarchy = (player: Player): boolean =>
  player.government?.current?._ === 'Anarchy';

export default isAnarchy;
