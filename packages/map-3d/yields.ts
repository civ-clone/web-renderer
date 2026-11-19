// What each square yields, on the 3D map (docs/3d-renderer.md §11, the `y` key): the 2D map's icons, standing in the
//  world over each square's middle, facing the camera, as strategy maps show them. They're laid out as the 2D map lays
//  them in its tile (`tileYieldGrid`: two rows, more columns the more there are), as big as fits the square seen from
//  above, so they shrink with distance like the land, and a nearer hill hides them.

import { Yield } from '@civ-clone/ui-protocol/types';
import { tileYieldGrid } from '@civ-clone/ui-client/lib/yieldMap';
import type { Topology } from '@civ-clone/ui-client/lib/topologyFor';
import type { GroundLayout } from './layouts';

/** How much of the circle inside a square a block of icons takes, so neighbouring blocks don't touch. */
export const YIELDS_FILL = 0.9;

/** A square's yields, and where they stand: over its middle (`u`, height, `v`) on the land as it's drawn. */
export type YieldSquare = {
  at: readonly [number, number, number];
  yields: Pick<Yield<string>, '_' | 'value'>[];
};

/** One icon of a square's yields: which, and its place in the block, in icons from the block's middle, right and up. */
export type YieldSlot = { _: string; right: number; up: number };

/**
 * Every icon to draw, as the stage takes them: each one's square's middle (`u`, height, `v`, three to an icon), its
 *  place in its block (right and up, in icons, two to an icon), how big its icons are (in the world's units, one to an
 *  icon), and which of `names` it is (one to an icon).
 */
export type YieldMesh = {
  count: number;
  anchors: Float32Array;
  slots: Float32Array;
  sizes: Float32Array;
  cells: Float32Array;
  names: string[];
};

/** A square's icons, as `tileYieldGrid` lays them, centred on the block they make. */
export const yieldSlots = (
  yields: Pick<Yield<string>, '_' | 'value'>[]
): { columns: number; slots: YieldSlot[] } => {
  const { columns, icons } = tileYieldGrid(yields),
    across = Math.min(columns, icons.length),
    down = Math.ceil(icons.length / columns);

  return {
    columns,
    slots: icons.map(({ _, column, row }) => ({
      _,
      right: column - (across - 1) / 2,
      up: (down - 1) / 2 - row,
    })),
  };
};

/**
 * How big a square's icons are, in the world's units, on a square with a circle `inner` across inside it: the 2D map's
 *  grid of `columns` across and two down, fitted in that circle, so it fits the square from above however the camera's
 *  turned. A square with more icons has smaller ones, as on the 2D map.
 */
export const yieldIconSize = (columns: number, inner: number): number =>
  (YIELDS_FILL * inner) / Math.hypot(columns, 2);

/**
 * How wide a circle fits inside a square of `layout`, in the world's units: as far as it is to a neighbour across an
 *  edge, from its middle to theirs, the nearest. The grid's squares are all alike.
 */
export const innerOf = (
  layout: Pick<GroundLayout, 'centre'>,
  topology: Pick<Topology, 'edgeDirections' | 'offset'>
): number => {
  const [u, v] = layout.centre(0, 0);

  return Math.min(
    ...topology.edgeDirections().map((direction) => {
      const [x, y] = topology.offset(direction, 0, 0),
        [toU, toV] = layout.centre(x, y);

      return Math.hypot(toU - u, toV - v);
    })
  );
};

/** A square's icons, laid out: where they stand, how big they are, and each one's place in its block. */
export type LaidYields = {
  at: readonly [number, number, number];
  size: number;
  slots: YieldSlot[];
};

/** A square's icons laid out on squares `inner` across, or nothing where it yields nothing. */
export const laidYields = (
  { at, yields }: YieldSquare,
  inner: number
): LaidYields | null => {
  const { columns, slots } = yieldSlots(yields);

  return slots.length === 0
    ? null
    : { at, size: yieldIconSize(columns, inner), slots };
};

/** Every icon of `squares`, laid out already, as the stage draws them. */
export const yieldMesh = (squares: Iterable<LaidYields>): YieldMesh => {
  const laid = [...squares],
    count = laid.reduce((total, { slots }) => total + slots.length, 0),
    mesh: YieldMesh = {
      count,
      anchors: new Float32Array(count * 3),
      slots: new Float32Array(count * 2),
      sizes: new Float32Array(count),
      cells: new Float32Array(count),
      names: [],
    },
    cells = new Map<string, number>();
  let index = 0;

  laid.forEach(({ at, size, slots }) => {
    slots.forEach(({ _, right, up }) => {
      let cell = cells.get(_);

      if (cell === undefined) {
        cell = mesh.names.push(_) - 1;
        cells.set(_, cell);
      }

      mesh.anchors[index * 3] = at[0];
      mesh.anchors[index * 3 + 1] = at[1];
      mesh.anchors[index * 3 + 2] = at[2];
      mesh.slots[index * 2] = right;
      mesh.slots[index * 2 + 1] = up;
      mesh.sizes[index] = size;
      mesh.cells[index] = cell;
      index++;
    });
  });

  return mesh;
};
