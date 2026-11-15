import { Direction, Topology, TopologyName, topologyName } from './topologyFor';

// The keys for a unit's own-tile actions. The first action in a list that the unit can take is the one the key sends,
//  and the first key an action appears under is the one its button's tooltip shows (#348).
//
// Civ2's orders (M2b) take Civ2's keys where they're free: O transforms and F builds a fortress (a unit that builds one
//  can't fortify). E is Explore here, so Build Airbase is Shift+E. Paradrop is P, which nothing that cleans up
//  pollution can do, and Airlift is L. Paradrop and Airlift then ask where (`distantOrders`).
export const keyToActionsMap: { [key: string]: string[] } = {
  ' ': ['NoOrders'],
  a: ['Automate'],
  b: ['FoundCity', 'JoinCity'],
  D: ['Disband'],
  e: ['Explore'],
  E: ['BuildAirbase'],
  f: ['Fortify', 'BuildFortress'],
  h: ['SetHomeCity'],
  i: ['BuildIrrigation', 'ClearForest', 'ClearSwamp', 'ClearJungle'],
  l: ['Airlift'],
  m: ['BuildMine', 'PlantForest'],
  o: ['TransformTerrain'],
  p: ['CleanPollution', 'Paradrop'],
  P: ['Pillage', 'SneakPillage'],
  r: ['BuildRoad', 'BuildRailroad'],
  s: ['Sleep'],
  u: ['Unload'],
};

// The keys that move a unit, or do whatever it can do to the tile that way, for each grid (#88). The numeric keypad
//  reaches these too, through `mappedKey`.
//  The isometric grid names its directions as they look on screen, so its keys are square's: ArrowUp (8) moves `n`,
//  straight up two rows (a corner), and PageUp (9) moves `ne`, to the tile up and right (an edge).
const screenRelativeKeys: { [key: string]: string } = {
  ArrowUp: 'n',
  PageUp: 'ne',
  ArrowRight: 'e',
  PageDown: 'se',
  ArrowDown: 's',
  End: 'sw',
  ArrowLeft: 'w',
  Home: 'nw',
};

export const directionKeyTables: {
  [name in TopologyName]: { [key: string]: string };
} = {
  square: screenRelativeKeys,
  'staggered-iso': screenRelativeKeys,
};

const directionKeysByTopology = new WeakMap<
  Topology,
  { [key: string]: Direction }
>();

/**
 * The keys that move a unit on `topology`'s grid, each to the direction it moves in. Only the directions the topology
 * has are bound: a key for one it does not have is not here, so it does nothing.
 */
export const directionKeys = (
  topology: Topology
): { [key: string]: Direction } => {
  if (!directionKeysByTopology.has(topology)) {
    const name = topologyName(topology),
      directions: readonly string[] = topology.directions();

    directionKeysByTopology.set(
      topology,
      Object.fromEntries(
        Object.entries(name === null ? {} : directionKeyTables[name]).filter(
          ([, direction]) => directions.includes(direction)
        )
      ) as { [key: string]: Direction }
    );
  }

  return directionKeysByTopology.get(topology)!;
};

export const keyForAction = (actionName: string): string | null =>
  Object.entries(keyToActionsMap).find(([, actions]) =>
    actions.includes(actionName)
  )?.[0] ?? null;

// As `aria-keyshortcuts` names a key, and as the tooltip shows it: a capital is typed with Shift (Disband, Pillage).
export const keyName = (key: string): string =>
  key === ' ' ? 'Space' : /^[A-Z]$/.test(key) ? `Shift+${key}` : key;

export default keyToActionsMap;
