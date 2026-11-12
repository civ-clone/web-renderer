import {
  BuildItem,
  City,
  CityBuild,
  Yield,
} from '@civ-clone/ui-protocol/types';
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

/**
 * What is holding a city's build back (#959), as the engine says it: the ids of the rules holding the item (`null` for
 *  a rule without one), and whether it is waiting `now`, paid for, or will wait once it is. `null` when nothing holds
 *  it. The page knows no rules: what the build waits for is only ever worded from these ids.
 */
export type BuildHold = { now: boolean; held: (string | null)[] };

// The ids as a hold, waiting `now` with nothing `remaining` to pay; `null` when nothing holds it.
const holdOf = (
  held: (string | null)[] | undefined,
  remaining: number
): BuildHold | null =>
  held === undefined || held.length === 0
    ? null
    : { now: remaining <= 0, held };

export const buildHold = (build: CityBuild): BuildHold | null =>
  build.building
    ? holdOf(
        build.held,
        build.remaining ?? build.cost.value - build.progress.value
      )
    : null;

/**
 * What would hold an item a city's build list offers (#970), from the ids sent with it: waiting `now` when the shields
 *  the city has stored already pay for it, as the list counts its turns. For the city as it is now.
 */
export const offeredHold = (
  cityBuild: CityBuild,
  buildItem: BuildItem
): BuildHold | null =>
  holdOf(buildItem.held, buildItem.cost.value - cityBuild.progress.value);

/**
 * What would hold the queued item at `index` (#970), from the ids sent for the queue. Queued items are counted from no
 *  shields, so one is never waiting `now`; and the ids are for the city as it is now, not as it will be when the item
 *  is reached, so they say what holds it as things stand.
 */
export const queuedHold = (
  cityBuild: CityBuild,
  index: number
): BuildHold | null => {
  const buildItem = cityBuild.queue?.[index];

  return buildItem === undefined
    ? null
    : holdOf(cityBuild.queueHeld?.[index], buildItem.cost.value);
};

/**
 * A city's build as every place that shows its turns should: the turns it takes, and what holds it (#959). While
 *  `hold.now`, the turns (1, as it is paid for) would mislead, and are shown as the hold instead; a build that will
 *  wait still takes `turns` to pay for.
 */
export type BuildOutlook = { turns: number; hold: BuildHold | null };

export const buildOutlook = (city: City): BuildOutlook => ({
  turns: buildTurns(city),
  hold: buildHold(city.build),
});

/**
 * Where a build sorts by its turns, the soonest first: one waiting now after every one that will be done, and one
 *  that never will (0 turns, which is said `Never`) last.
 */
export const buildTurnsOrder = ({ turns, hold }: BuildOutlook): number =>
  hold?.now ? Number.MAX_SAFE_INTEGER : turns === 0 ? Infinity : turns;

export const growthTurns = (city: City) =>
  turnsLeft(city.growth, city.yields, 'Food');
