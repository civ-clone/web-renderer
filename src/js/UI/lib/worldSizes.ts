import topologyFor, { TopologyId } from './topologyFor';

/**
 * The world sizes New Game offers (#55). Each is Civ1's 8:5 shape, with Normal being Civ1's own 80 × 50 map, and
 * each offers its own range of civilizations, with one selected: a bigger world has room for more of them. Civ1 has 14
 * civilizations, so no size offers more. civ1-world-civilizations adds 12 more to choose from (#466), but a game still
 * has at most 14. Customize World remains the place for exact values.
 *
 * `landCoverage` and `landSize` are proportions of the world, so they need no scaling here.
 */
export interface WorldSize {
  key: string;
  width: number;
  height: number;
  minPlayers: number;
  maxPlayers: number;
  players: number;
  /** Whether there is an Earth map this size, so Earth offers it. */
  earth: boolean;
}

export const worldSizes: WorldSize[] = [
  {
    key: 'tiny',
    earth: false,
    width: 40,
    height: 25,
    minPlayers: 2,
    maxPlayers: 4,
    players: 3,
  },
  {
    key: 'small',
    earth: false,
    width: 64,
    height: 40,
    minPlayers: 3,
    maxPlayers: 6,
    players: 5,
  },
  {
    key: 'normal',
    earth: true,
    width: 80,
    height: 50,
    minPlayers: 3,
    maxPlayers: 7,
    players: 7,
  },
  {
    key: 'large',
    earth: true,
    width: 104,
    height: 65,
    minPlayers: 3,
    maxPlayers: 10,
    players: 9,
  },
  {
    key: 'huge',
    earth: true,
    width: 128,
    height: 80,
    minPlayers: 3,
    maxPlayers: 14,
    players: 12,
  },
];

/** The sizes Earth comes in: Civ1's own map for Normal, and larger versions of it. */
export const earthWorldSizes: WorldSize[] = worldSizes.filter(
  ({ earth }) => earth
);

export const defaultWorldSize: WorldSize = worldSizes.find(
  ({ key }) => key === 'normal'
)!;

/**
 * Each size's width and height on the other grids (#89), keeping its number of tiles and its shape on screen. A
 * staggered isometric row is half a tile tall and its tiles twice as wide as they are tall, so the same world is half
 * as many tiles across and twice as many down, and a hexagonal row is three-quarters of a tile tall. Both grids need an
 * even height, to wrap north to south.
 */
const gridDimensions: {
  [id in Exclude<TopologyId, 'square'>]: { [key: string]: [number, number] };
} = {
  'staggered-iso': Object.fromEntries(
    worldSizes.map(({ key, width, height }) => [key, [width / 2, height * 2]])
  ),
  'hex-odd-r': {
    tiny: [38, 26],
    small: [61, 42],
    normal: [74, 54],
    large: [97, 70],
    huge: [119, 86],
  },
};

/** The sizes New Game offers on `topologyId`'s grid: the same sizes, each with that grid's width and height. */
export const worldSizesFor = (topologyId: TopologyId): WorldSize[] =>
  topologyId === 'square'
    ? worldSizes
    : worldSizes.map((size) => {
        const [width, height] = gridDimensions[topologyId][size.key];

        return { ...size, width, height };
      });

/**
 * What is wrong with a world `width` by `height` on `topologyId`'s grid, as Customize World is given them: the field
 * to fix and the message to show there, or `null` for a size the world can be.
 */
export const customSizeProblem = (
  topologyId: TopologyId,
  width: string,
  height: string
): { field: 'height' | 'width'; message: string } | null => {
  const dimensions = { width: Number(width), height: Number(height) },
    notWhole = (['width', 'height'] as const).find(
      (field) => !Number.isInteger(dimensions[field]) || dimensions[field] < 1
    );

  if (notWhole) {
    return { field: notWhole, message: 'CustomizeWorld.whole-number' };
  }

  try {
    topologyFor({ topologyId, ...dimensions });
  } catch {
    // Any whole size will do for a square world, so this is a staggered or hexagonal world with an odd height.
    return { field: 'height', message: 'CustomizeWorld.even-height' };
  }

  return null;
};

/** The numbers of civilizations to offer for `size`, largest first, as the list has always been ordered. */
export const playerCounts = ({ minPlayers, maxPlayers }: WorldSize): number[] =>
  new Array(maxPlayers - minPlayers + 1)
    .fill(0)
    .map((value, index) => maxPlayers - index);

export default worldSizes;
