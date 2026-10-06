/**
 * The world sizes New Game offers (#55). Each is Civ1's 8:5 shape, with Normal being Civ1's own 80 × 50 map, and
 * each offers its own range of civilizations, with one selected: a bigger world has room for more of them. There are
 * 14 civilizations, so no size offers more. Customize World remains the place for exact values.
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
}

export const worldSizes: WorldSize[] = [
  {
    key: 'tiny',
    width: 40,
    height: 25,
    minPlayers: 2,
    maxPlayers: 4,
    players: 3,
  },
  {
    key: 'small',
    width: 64,
    height: 40,
    minPlayers: 3,
    maxPlayers: 6,
    players: 5,
  },
  {
    key: 'normal',
    width: 80,
    height: 50,
    minPlayers: 3,
    maxPlayers: 7,
    players: 7,
  },
  {
    key: 'large',
    width: 104,
    height: 65,
    minPlayers: 3,
    maxPlayers: 10,
    players: 9,
  },
  {
    key: 'huge',
    width: 128,
    height: 80,
    minPlayers: 3,
    maxPlayers: 14,
    players: 12,
  },
];

export const defaultWorldSize: WorldSize = worldSizes.find(
  ({ key }) => key === 'normal'
)!;

/** The numbers of civilizations to offer for `size`, largest first, as the list has always been ordered. */
export const playerCounts = ({ minPlayers, maxPlayers }: WorldSize): number[] =>
  new Array(maxPlayers - minPlayers + 1)
    .fill(0)
    .map((value, index) => maxPlayers - index);

export default worldSizes;
