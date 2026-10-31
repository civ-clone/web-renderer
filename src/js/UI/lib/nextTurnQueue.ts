import { PlayerAction } from '../types';

// What the Next Turn button (#702) goes through, in order: the questions the engine is waiting on, then the units
//  awaiting orders (as one item), then the standing notices, then End turn, which the engine offers only once nothing
//  it must have is left. Pure, so the button and the tests share it.

export type NextTurnItem =
  | { id: string; kind: 'action'; action: PlayerAction }
  | { id: 'units'; kind: 'units'; count: number };

const order = [
  'ChooseGovernment',
  'ChooseResearch',
  'CityBuild',
  // The units go here.
  'CivilDisorder',
  'Notice',
  'EndTurn',
];

const unitsAt = order.indexOf('CivilDisorder');

/**
 * The queue from the primary panel's actions (`partitionActions`'s `primary`) and the player's own, whose
 *  `ActiveUnit`s are the units awaiting orders. Empty while waiting: the actions are still last turn's.
 */
export const nextTurnQueue = (
  primary: PlayerAction[],
  playerActions: (PlayerAction | null | undefined)[],
  waiting: boolean
): NextTurnItem[] => {
  if (waiting) {
    return [];
  }

  const rank = (item: NextTurnItem) =>
      item.kind === 'units' ? unitsAt - 0.5 : order.indexOf(item.action._),
    units = playerActions.filter((action) => action?._ === 'ActiveUnit').length,
    items: NextTurnItem[] = primary
      .filter((action) => order.includes(action._))
      .map((action) => ({ id: action.id, kind: 'action', action }));

  if (units > 0) {
    items.push({ id: 'units', kind: 'units', count: units });
  }

  // Stable, so the cities keep the order the engine gives them.
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index)
    .map(({ item }) => item);
};

export default nextTurnQueue;
