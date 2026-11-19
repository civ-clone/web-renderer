import { Direction, Topology, TopologyName, topologyName } from './topologyFor';

// The keys for a unit's own-tile actions. The first action in a list that the unit can take is the one the key sends,
//  and the first key an action appears under is the one its button's tooltip shows (#348).
//
// Civ2's orders (M2b) take Civ2's keys, after what those keys already did: O transforms, F builds a fortress and E an
//  airbase (a unit that builds them neither fortifies nor explores), P paradrops (nothing that cleans up pollution
//  can) and L airlifts. I builds Farmland (M2c) on a square already irrigated, where irrigating is no longer offered. Paradrop and Airlift then ask where (`distantOrders`).
export const keyToActionsMap: { [key: string]: string[] } = {
  ' ': ['NoOrders'],
  a: ['Automate'],
  b: ['FoundCity', 'JoinCity'],
  D: ['Disband'],
  e: ['Explore', 'BuildAirbase'],
  f: ['Fortify', 'BuildFortress'],
  h: ['SetHomeCity'],
  i: [
    'BuildIrrigation',
    'BuildFarmland',
    'ClearForest',
    'ClearSwamp',
    'ClearJungle',
  ],
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
  // Pointy-topped hexes have no neighbour straight up or down, so the screen-relative keys the grid has are its six
  //  (numpad 7 9 4 6 1 3), and the up and down arrows (numpad 8 and 2) move nothing (#94).
  'hex-odd-r': screenRelativeKeys,
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

// The way each key that moves a unit points on the screen: right, and up.
const keyPoints: { [key: string]: readonly [number, number] } = {
  ArrowUp: [0, 1],
  PageUp: [1, 1],
  ArrowRight: [1, 0],
  PageDown: [1, -1],
  ArrowDown: [0, -1],
  End: [-1, -1],
  ArrowLeft: [-1, 0],
  Home: [-1, 1],
};

/**
 * How a map that turns is turned (the 3D map's camera): its turn from north, clockwise seen from above, in radians, and
 *  the way each of its grid's directions points on the ground from a square, east and south, as it's drawn.
 */
export type MapHeading = {
  turn: number;
  directions: { [direction: string]: readonly [number, number] };
};

// Where a way on the ground, east and south, points with the map turned by `turn`, as the camera's way ahead does.
const turned = (
  [east, south]: readonly [number, number],
  turn: number
): [number, number] => [
  east * Math.cos(turn) - south * Math.sin(turn),
  east * Math.sin(turn) + south * Math.cos(turn),
];

// The angle from one way on the ground to another, clockwise seen from above (east towards south), within half a turn
//  either way.
const angleFrom = (
  [a, b]: readonly [number, number],
  [c, d]: readonly [number, number]
): number => Math.atan2(a * d - b * c, a * c + b * d);

/**
 * The keys that move a unit on a map turned as `heading` says, from `keys`, those of the map unturned. Each moves the
 *  unit in the grid's direction nearest the way the key points, turned on the ground as the camera is, so up moves it
 *  the way the camera faces. That's the way the key points on the screen seen from above; seen at a slant, the ground
 *  ahead is foreshortened, and a diagonal key can look a little off its neighbour. A key that moves nothing unturned
 *  (the up and down arrows on a hex grid, which has no neighbour straight up or down) moves the unit only where one of
 *  the grid's directions is within a sixteenth of a turn (22.5°) of its way. Unturned, they're `keys`.
 */
export const turnedDirectionKeys = (
  keys: { [key: string]: Direction },
  heading: MapHeading
): { [key: string]: Direction } => {
  const directions = Object.entries(heading.directions) as [
    Direction,
    readonly [number, number]
  ][];

  return Object.fromEntries(
    Object.entries(keyPoints).flatMap(
      ([key, [right, up]]): [string, Direction][] => {
        // The way the key points on the screen, on the ground: up is north, unturned.
        const unturned = keys[key],
          way = turned([right, -up], heading.turn);
        let nearest: Direction | null = null,
          off = Infinity;

        for (const [direction, points] of directions) {
          const signed = angleFrom(way, points),
            angle = Math.abs(signed);

          // Of two as near (turned half way between them), the one clockwise of it, so each key still moves a unit
          //  a way of its own.
          if (
            angle < off - 1e-9 ||
            (Math.abs(angle - off) <= 1e-9 && signed > 0)
          ) {
            nearest = direction;
            off = angle;
          }
        }

        return nearest === null ||
          (unturned === undefined && off > Math.PI / 8 + 1e-9)
          ? []
          : [[key, nearest]];
      }
    )
  );
};

/**
 * The keys that move a unit on `topology`'s grid, turned with the map where it's turned (`heading`), as
 *  `turnedDirectionKeys` turns them: those of `directionKeys`, unturned.
 */
export const movingKeys = (
  topology: Topology,
  heading: MapHeading | null = null
): { [key: string]: Direction } =>
  heading === null
    ? directionKeys(topology)
    : turnedDirectionKeys(directionKeys(topology), heading);

export const keyForAction = (actionName: string): string | null =>
  Object.entries(keyToActionsMap).find(([, actions]) =>
    actions.includes(actionName)
  )?.[0] ?? null;

// As `aria-keyshortcuts` names a key, and as the tooltip shows it: a capital is typed with Shift (Disband, Pillage).
export const keyName = (key: string): string =>
  key === ' ' ? 'Space' : /^[A-Z]$/.test(key) ? `Shift+${key}` : key;

export default keyToActionsMap;
