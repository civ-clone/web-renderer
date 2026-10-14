import { NeighbourDirection } from '../types';

// The keys for a unit's own-tile actions. The first action in a list that the unit can take is the one the key sends,
//  and the first key an action appears under is the one its button's tooltip shows (#348).
export const keyToActionsMap: { [key: string]: string[] } = {
  ' ': ['NoOrders'],
  a: ['Automate'],
  b: ['FoundCity', 'JoinCity'],
  D: ['Disband'],
  e: ['Explore'],
  f: ['Fortify', 'BuildFortress'],
  i: ['BuildIrrigation', 'ClearForest', 'ClearSwamp', 'ClearJungle'],
  m: ['BuildMine', 'PlantForest'],
  p: ['CleanPollution'],
  P: ['Pillage'],
  r: ['BuildRoad', 'BuildRailroad'],
  s: ['Sleep'],
  u: ['Unload'],
};

// The keys that move a unit, or do whatever it can do to the tile that way.
export const directionKeyMap: { [key: string]: NeighbourDirection } = {
  ArrowUp: 'n',
  PageUp: 'ne',
  ArrowRight: 'e',
  PageDown: 'se',
  ArrowDown: 's',
  End: 'sw',
  ArrowLeft: 'w',
  Home: 'nw',
};

export const keyForAction = (actionName: string): string | null =>
  Object.entries(keyToActionsMap).find(([, actions]) =>
    actions.includes(actionName)
  )?.[0] ?? null;

export default keyToActionsMap;
