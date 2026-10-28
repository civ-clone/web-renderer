import { Direction, Topology, TopologyName, topologyName } from './topologyFor';

// The keys for a unit's own-tile actions. The first action in a list that the unit can take is the one the key sends,
//  and the first key an action appears under is the one its button's tooltip shows (#348).
export const keyToActionsMap: { [key: string]: string[] } = {
  ' ': ['NoOrders'],
  a: ['Automate'],
  b: ['FoundCity', 'JoinCity'],
  D: ['Disband'],
  e: ['Explore'],
  f: ['Fortify', 'BuildFortress'],
  h: ['SetHomeCity'],
  i: ['BuildIrrigation', 'ClearForest', 'ClearSwamp', 'ClearJungle'],
  m: ['BuildMine', 'PlantForest'],
  p: ['CleanPollution'],
  P: ['Pillage', 'SneakPillage'],
  r: ['BuildRoad', 'BuildRailroad'],
  s: ['Sleep'],
  u: ['Unload'],
};

// The keys that move a unit, or do whatever it can do to the tile that way, for each grid (#88). The numeric keypad
//  reaches these too, through `mappedKey`.
export const directionKeyTables: {
  [name in TopologyName]: { [key: string]: string };
} = {
  square: {
    ArrowUp: 'n',
    PageUp: 'ne',
    ArrowRight: 'e',
    PageDown: 'se',
    ArrowDown: 's',
    End: 'sw',
    ArrowLeft: 'w',
    Home: 'nw',
  },
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

export default keyToActionsMap;
