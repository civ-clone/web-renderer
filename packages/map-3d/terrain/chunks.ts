// The land's mesh (docs/3d-renderer.md §4.2): the ground cut into chunks about 16 squares across, each a regular grid of
//  points about 8 to a square, with a height, a normal and a colour at each. The mesh doesn't follow squares' edges, so
//  one builder serves every grid. Pure: the stage turns each chunk into three.js geometry.
//
// Chunks' borders are exact: the chunks divide the world's period, and every point is placed by its index on the whole
//  ground, so a point two chunks share is the same point, with the same height. Normals come from the height function
//  either side of each point, not from a chunk's own triangles, so the light has no seam along chunks' borders either.
//  The ground's axes are three.js's: `u` east is `x`, height is `y`, and `v` south is `z`.

import { GroundLayout } from '../layouts/GroundLayout';
import { ReliefMap } from './relief';
import { RibbonMesh, ribbonOf } from './ribbons';

/** How the ground is cut into chunks, and how finely each is sampled. */
export type ChunkGrid = {
  // How many chunks across and down.
  chunksU: number;
  chunksV: number;
  // How many steps between points each chunk has across and down, and how far apart they are.
  stepsU: number;
  stepsV: number;
  spacingU: number;
  spacingV: number;
};

/** A chunk's points, as three.js takes them, relative to the chunk's corner at (`u`, `v`). */
export type ChunkMesh = {
  u: number;
  v: number;
  positions: Float32Array;
  normals: Float32Array;
  colours: Float32Array;
  // How much of each surface (`SURFACES`) the ground is at each point, from 0 to 255: the first four, then the last.
  surfacesA: Uint8Array;
  surfacesB: Uint8Array;
  // How much of what the ground's blended from is water squares at each point, from 0 to 255 (`GroundSample#shore`).
  shore: Uint8Array;
  // 1 at each point on a square never seen, and 0 elsewhere, for the cloud over them.
  unseen: Float32Array;
  indices: Uint32Array;
  // The water of the rivers whose courses start in the chunk, relative to its corner, as the land's points are, and how
  //  white it is at each point (`foamAt`); or none.
  river: {
    positions: Float32Array;
    indices: Uint32Array;
    foam: Float32Array;
  } | null;
};

/**
 * The chunks of a world's ground: as many whole chunks as fit its period across, and down where it wraps, or else its
 *  rows' extent, each about `size` across, sampled about `perUnit` times a world unit.
 */
export const chunkGrid = (
  layout: GroundLayout,
  rows: number,
  { size = 16, perUnit = 8 }: { size?: number; perUnit?: number } = {}
): ChunkGrid => {
  const { u: across, v: down } = layout.period(),
    // A world that doesn't wrap over the poles: down to the last row's bottom.
    extentV =
      down ??
      Math.max(
        ...layout.outline(0, rows - 1).map(([, v]) => v),
        ...layout.outline(1, rows - 1).map(([, v]) => v)
      ),
    chunksU = Math.max(1, Math.round(across / size)),
    chunksV = Math.max(1, Math.round(extentV / size)),
    stepsU = Math.max(2, Math.round((across / chunksU) * perUnit)),
    stepsV = Math.max(2, Math.round((extentV / chunksV) * perUnit));

  return {
    chunksU,
    chunksV,
    stepsU,
    stepsV,
    spacingU: across / chunksU / stepsU,
    spacingV: extentV / chunksV / stepsV,
  };
};

/**
 * The chunk, `i` across and `j` down, that carries what starts at (`u`, `v`) on the world's first copy, such as a river's
 *  course: the one it's in, worked out the same way for every chunk, so each thing is carried by one, even on a chunk's
 *  border, where its origin and the last one's far edge, each worked out its own way, can differ by a hair.
 */
export const carriedBy = (
  grid: ChunkGrid,
  u: number,
  v: number
): [i: number, j: number] => [
  Math.max(
    0,
    Math.min(grid.chunksU - 1, Math.floor(u / (grid.stepsU * grid.spacingU)))
  ),
  Math.max(
    0,
    Math.min(grid.chunksV - 1, Math.floor(v / (grid.stepsV * grid.spacingV)))
  ),
];

/** The mesh of the chunk `i` across and `j` down. */
export const buildChunk = (
  grid: ChunkGrid,
  relief: ReliefMap,
  i: number,
  j: number
): ChunkMesh => {
  const { stepsU, stepsV, spacingU, spacingV } = grid,
    firstU = i * stepsU,
    firstV = j * stepsV,
    // Every point by its index on the whole ground: the same index, the same point, in any chunk.
    at = (indexU: number, indexV: number): [number, number] => [
      indexU * spacingU,
      indexV * spacingV,
    ],
    // Heights one point further out on every side, for the normals at the chunk's border.
    across = stepsU + 3,
    heights = new Float64Array(across * (stepsV + 3)),
    points = (stepsU + 1) * (stepsV + 1),
    colours = new Float32Array(points * 3),
    surfacesA = new Uint8Array(points * 4),
    surfacesB = new Uint8Array(points * 4),
    shore = new Uint8Array(points),
    unseen = new Float32Array(points);

  // Each point sampled once: its height, and its colour if it's the chunk's own.
  for (let b = -1; b <= stepsV + 1; b++) {
    for (let a = -1; a <= stepsU + 1; a++) {
      const sampled = relief.sample(...at(firstU + a, firstV + b)),
        { height, colour } = sampled;

      heights[(b + 1) * across + (a + 1)] = height;

      if (a >= 0 && a <= stepsU && b >= 0 && b <= stepsV) {
        const point = b * (stepsU + 1) + a;

        colours.set(colour, point * 3);
        sampled.surfaces.forEach((share, surface) => {
          (surface < 4 ? surfacesA : surfacesB)[point * 4 + (surface % 4)] =
            Math.round(share * 255);
        });
        shore[point] = Math.round(sampled.shore * 255);
        unseen[point] = sampled.unseen ? 1 : 0;
      }
    }
  }

  const height = (a: number, b: number): number =>
      heights[(b + 1) * across + (a + 1)] ?? 0,
    positions = new Float32Array(points * 3),
    normals = new Float32Array(points * 3),
    [originU, originV] = at(firstU, firstV);

  for (let b = 0; b <= stepsV; b++) {
    for (let a = 0; a <= stepsU; a++) {
      const point = b * (stepsU + 1) + a,
        [u, v] = at(firstU + a, firstV + b),
        slopeU = (height(a + 1, b) - height(a - 1, b)) / (2 * spacingU),
        slopeV = (height(a, b + 1) - height(a, b - 1)) / (2 * spacingV),
        length = Math.hypot(slopeU, 1, slopeV);

      positions[point * 3] = u - originU;
      positions[point * 3 + 1] = height(a, b);
      positions[point * 3 + 2] = v - originV;

      normals[point * 3] = -slopeU / length;
      normals[point * 3 + 1] = 1 / length;
      normals[point * 3 + 2] = -slopeV / length;
    }
  }

  // Two triangles a cell, wound to face up (anticlockwise seen from above, with `v` south as three.js's `z`).
  const indices = new Uint32Array(stepsU * stepsV * 6);

  for (let b = 0; b < stepsV; b++) {
    for (let a = 0; a < stepsU; a++) {
      const topLeft = b * (stepsU + 1) + a,
        topRight = topLeft + 1,
        bottomLeft = topLeft + stepsU + 1,
        bottomRight = bottomLeft + 1,
        cell = (b * stepsU + a) * 6;

      indices.set(
        [topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight],
        cell
      );
    }
  }

  // The land as its mesh draws it at (`lu`, `lv`) from the chunk's corner: between the points of the triangle it's in,
  //  two to a cell, as above. Each point as high as the chunk has it, or, past its edge, as the next chunk will.
  const past = new Map<string, number>(),
    pointHeight = (a: number, b: number): number => {
      if (a >= -1 && a <= stepsU + 1 && b >= -1 && b <= stepsV + 1) {
        return height(a, b);
      }

      const key = `${a},${b}`;
      let sampled = past.get(key);

      if (sampled === undefined) {
        sampled = relief.sample(...at(firstU + a, firstV + b)).height;
        past.set(key, sampled);
      }

      return sampled;
    },
    groundAt = (lu: number, lv: number): number => {
      const a = Math.floor(lu / spacingU),
        b = Math.floor(lv / spacingV),
        fu = lu / spacingU - a,
        fv = lv / spacingV - b;

      return fu + fv <= 1
        ? pointHeight(a, b) +
            (pointHeight(a + 1, b) - pointHeight(a, b)) * fu +
            (pointHeight(a, b + 1) - pointHeight(a, b)) * fv
        : pointHeight(a + 1, b + 1) +
            (pointHeight(a, b + 1) - pointHeight(a + 1, b + 1)) * (1 - fu) +
            (pointHeight(a + 1, b) - pointHeight(a + 1, b + 1)) * (1 - fv);
    };

  // The rivers' water: each course drawn by the chunk that carries its start, once, laid on the land as it's drawn.
  const ribbon: RibbonMesh = { positions: [], indices: [], foam: [] };

  relief.courses().forEach(({ course, u, v }) => {
    const [ci, cj] = carriedBy(grid, u, v);

    if (ci === i && cj === j) {
      ribbonOf(course, u - originU, v - originV, ribbon, {
        at: groundAt,
        spacingU,
        spacingV,
      });
    }
  });

  return {
    u: originU,
    v: originV,
    positions,
    normals,
    colours,
    surfacesA,
    surfacesB,
    shore,
    unseen,
    indices,
    river:
      ribbon.indices.length === 0
        ? null
        : {
            positions: new Float32Array(ribbon.positions),
            indices: new Uint32Array(ribbon.indices),
            foam: new Float32Array(ribbon.foam),
          },
  };
};

/**
 * The chunks a change to `squares` can reach: their land within the kernel's reach, and the sea's floor within the walk
 *  from land, each by its index, `i` across and `j` down. Chunks past the world's edge are taken round its period.
 */
export const chunksNear = (
  grid: ChunkGrid,
  layout: GroundLayout,
  squares: [number, number][],
  reach: number
): [number, number][] => {
  const chunkU = grid.stepsU * grid.spacingU,
    chunkV = grid.stepsV * grid.spacingV,
    wraps = layout.period().v !== null,
    found = new Set<string>();

  squares.forEach(([x, y]) => {
    const [u, v] = layout.centre(x, y);

    for (
      let i = Math.floor((u - reach) / chunkU);
      i <= Math.floor((u + reach) / chunkU);
      i++
    ) {
      for (
        let j = Math.floor((v - reach) / chunkV);
        j <= Math.floor((v + reach) / chunkV);
        j++
      ) {
        if (!wraps && (j < 0 || j >= grid.chunksV)) {
          continue;
        }

        const wrappedI = ((i % grid.chunksU) + grid.chunksU) % grid.chunksU,
          wrappedJ = wraps
            ? ((j % grid.chunksV) + grid.chunksV) % grid.chunksV
            : j;

        found.add(`${wrappedI},${wrappedJ}`);
      }
    }
  });

  return [...found].map(
    (key) => key.split(',').map(Number) as [number, number]
  );
};
