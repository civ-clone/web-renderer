// A city in civil disorder on the 3D map (docs/3d-renderer.md §7.4, plan 4.3): fires on its roofs, and a column of
//  smoke rising from each, leaning the way the wind takes it. One column for a small city, two from size 4 and three
//  from size 8, among its buildings behind and beside its middle, clear of where its units stand in front. Each city's
//  are its own, the same every time it's drawn, by its name. Still, as smog is: it doesn't drift.
//
// Pure: what's drawn and where, from the city's middle on the ground (`x` east, `y` up, `z` south), as the marker kit
//  draws it (`MarkerKit#disorder`).

/** One piece of a city's disorder: a flame or a puff of smoke, where it is, how big, and its colour. */
export type DisorderPiece = {
  kind: 'fire' | 'smoke';
  at: [number, number, number];
  // A flame's half-width and half-height; a puff's radius, the same three ways.
  size: [number, number, number];
  colour: string;
};

/** The numbers a city's disorder is drawn by. */
export const DISORDER = {
  // How far from the city's middle its columns stand, from the nearest to the furthest.
  near: 0.16,
  far: 0.32,
  // How far either side of straight behind the middle they're spread, at most, in radians: none in front.
  spread: (Math.PI * 5) / 9,
  // A flame's height over the ground, on the roofs, and its half-width and half-height.
  fireAt: 0.08,
  fireWidth: 0.026,
  fireHeight: 0.05,
  // A column's puffs: how many, how high the first is and how far apart they are up, how big the first is and how much
  //  bigger each is, and how far each leans downwind of the one under it. Big enough to tell at the default zoom.
  puffs: 6,
  firstPuff: 0.15,
  puffRise: 0.09,
  firstSize: 0.038,
  puffGrowth: 0.02,
  lean: 0.03,
  // How far each puff's thrown either way across and along the column, at most, so it billows rather than stacks.
  billow: 0.018,
} as const;

// From dark to lighter as it rises and thins.
const SMOKE = [
    '#3a3733',
    '#4a4743',
    '#5c5954',
    '#6f6b65',
    '#827e77',
    '#94908a',
  ] as const,
  FLAMES = ['#ff7316', '#ffbf33'] as const;

// A share, 0 to 1, from a city's name and which of its numbers it is: the same each time.
const share = (name: string, which: number): number => {
  let hash = 2166136261 ^ which;

  for (let at = 0; at < name.length; at++) {
    hash = Math.imul(hash ^ name.charCodeAt(at), 16777619);
  }

  hash = Math.imul(hash ^ (hash >>> 15), 2246822507);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909);

  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
};

/** How many columns of smoke a city `size` big has in disorder. */
export const disorderColumns = (size: number): number =>
  size >= 8 ? 3 : size >= 4 ? 2 : 1;

/** What a city named `name`, `size` big, in disorder is drawn with: its fires and its columns of smoke. */
export const disorderPieces = (name: string, size: number): DisorderPiece[] => {
  const columns = disorderColumns(size),
    // The way the wind leans the smoke, the same for every column of the city.
    wind = share(name, 0) * Math.PI * 2,
    windX = Math.cos(wind),
    windZ = Math.sin(wind),
    pieces: DisorderPiece[] = [];

  for (let column = 0; column < columns; column++) {
    // Spread evenly across the back, each nudged a little, so a city's columns don't line up.
    const slot = columns === 1 ? 0 : (column / (columns - 1)) * 2 - 1,
      angle =
        slot * DISORDER.spread * 0.8 +
        (share(name, 1 + column) - 0.5) * DISORDER.spread * 0.4,
      reach =
        DISORDER.near +
        share(name, 11 + column) * (DISORDER.far - DISORDER.near),
      // Behind the middle (north, -z) is no turn; east is a turn one way, west the other.
      baseX = Math.sin(angle) * reach,
      baseZ = -Math.cos(angle) * reach;

    // Two flames side by side on the roofs, one a little taller.
    FLAMES.forEach((colour, flame) =>
      pieces.push({
        kind: 'fire',
        at: [
          baseX + (flame === 0 ? -1 : 1) * DISORDER.fireWidth * 0.9,
          DISORDER.fireAt,
          baseZ,
        ],
        size: [
          DISORDER.fireWidth,
          DISORDER.fireHeight * (flame === 0 ? 1 : 0.75),
          DISORDER.fireWidth,
        ],
        colour,
      })
    );

    // Its smoke, rising and growing, leaning further downwind the higher it is, each puff thrown a little either way,
    //  and a little flatter than round, so it billows.
    for (let puff = 0; puff < DISORDER.puffs; puff++) {
      const radius = DISORDER.firstSize + puff * DISORDER.puffGrowth,
        lean = DISORDER.lean * puff ** 1.4,
        thrownX = (share(name, 21 + column * 8 + puff) - 0.5) * 2,
        thrownZ = (share(name, 61 + column * 8 + puff) - 0.5) * 2;

      pieces.push({
        kind: 'smoke',
        at: [
          baseX + windX * lean + thrownX * DISORDER.billow,
          DISORDER.firstPuff + DISORDER.puffRise * puff,
          baseZ + windZ * lean + thrownZ * DISORDER.billow,
        ],
        size: [radius, radius * 0.85, radius],
        colour: SMOKE[puff] ?? SMOKE[SMOKE.length - 1]!,
      });
    }
  }

  return pieces;
};

export default disorderPieces;
