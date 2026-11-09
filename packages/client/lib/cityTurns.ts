import { City, Yield } from '@civ-clone/ui-protocol/types';
import { reduceKnownYield } from './yieldMap';

// How many turns a city has left to build or grow, as plain sums: the map's banners (#747) count them without the
//  interface's pictures, which `components/lib/cityYields` loads.

// `data` is a city's growth or build, the player's research, or anything else with a cost and progress so far.
export const turnsLeft = (
  data: { cost: { value: number }; progress: { value: number } },
  yields: Yield[],
  yieldName: string
) => {
  const net = reduceKnownYield(yields, yieldName),
    remaining = data.cost.value - data.progress.value;

  // Done at the end of the turn, whatever comes in: progress already covers the cost.
  if (remaining <= 0) {
    return 1;
  }

  // 0, which the translations say as `Never`, with nothing to spare or a shortfall: a starving city counted its
  //  shortfall as progress (#489).
  if (net <= 0) {
    return 0;
  }

  return Math.max(1, Math.ceil(remaining / net));
};

export const buildTurns = (city: City) =>
  turnsLeft(city.build, city.yields, 'Production');

export const growthTurns = (city: City) =>
  turnsLeft(city.growth, city.yields, 'Food');
