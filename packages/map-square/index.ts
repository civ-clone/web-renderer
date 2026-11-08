import { WorldDimensions } from '@civ-clone/ui-map/lib/projection';
import { registerGrid, refuse } from '@civ-clone/ui-map/lib/projectionFor';
import SquareProjection from './SquareProjection';
import { TilesetDescriptor } from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';

// The square grid, made drawable (#825): the page loads this for the map to draw square tilesets.

/** The projection a square `tileset` is drawn with, or a refusal for geometry `SquareProjection` cannot draw. */
export const squareProjection = (
  tileset: TilesetDescriptor,
  world: WorldDimensions,
  tileSize: number,
  wrapVertical: boolean
): SquareProjection => {
  const {
    tile: { width, height },
    geometry: { columnStep, rowStep, oddRowShift, anchor, overhang },
  } = tileset;

  // A square grid is one size of square, side by side: each tile is its own box, as far across and down as the next.
  if (
    width !== height ||
    columnStep !== width ||
    rowStep !== height ||
    oddRowShift !== 0
  ) {
    refuse(
      tileset,
      `a square grid's tiles are as far apart as they are wide and tall, and no row is shifted, not ${width} × ${height} tiles ${columnStep} × ${rowStep} apart with odd rows ${oddRowShift} across.`
    );
  }

  // `SquareProjection` takes no anchor or overhang, so a square tileset with either would have its sprites put in the
  //  wrong place or clipped: refused until it does (#91).
  if (
    anchor.x !== 0 ||
    anchor.y !== 0 ||
    Object.values(overhang).some((side) => side !== 0)
  ) {
    refuse(
      tileset,
      "a square grid's sprites sit in their own tile, with no anchor or overhang, for now."
    );
  }

  // `tileSize` is the native tile scaled, so the steps scale with it. On a square grid the step is the tile, so this is
  //  `tileSize` exactly (multiplied first, so no rounding creeps in); it is written as a step for the grids to come.
  return new SquareProjection(
    (columnStep * tileSize) / width,
    world,
    wrapVertical
  );
};

registerGrid('square', squareProjection);
