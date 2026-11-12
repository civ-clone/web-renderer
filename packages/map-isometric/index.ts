import { Reach, Size, WorldDimensions } from '@civ-clone/ui-map/lib/projection';
import {
  GridOverview,
  registerGrid,
  refuse,
} from '@civ-clone/ui-map/lib/projectionFor';
import IsoProjection from './IsoProjection';
import Minimap from './Minimap';
import Overview from './Overview';
import { TilesetDescriptor } from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';

// The staggered isometric grid, made drawable (#97): the page loads this for the map to draw isometric tilesets. It is
//  offered once one is installed too (`supportedTopologies`): Civ2's, once its art has been imported.

/** The projection an isometric `tileset` is drawn with, or a refusal for geometry `IsoProjection` cannot draw. */
export const isoProjection = (
  tileset: TilesetDescriptor,
  world: WorldDimensions,
  tileSize: Size,
  wrapVertical: boolean
): IsoProjection => {
  const {
    tile: { width, height },
    geometry: { columnStep, rowStep, oddRowShift, anchor, overhang },
  } = tileset;

  // A staggered grid is diamonds as wide as the columns are apart, in rows half a diamond apart, odd rows pushed half
  //  a diamond across.
  if (
    columnStep !== width ||
    rowStep * 2 !== height ||
    oddRowShift * 2 !== width
  ) {
    refuse(
      tileset,
      `a staggered isometric grid's tiles are as far apart as they are wide, in rows half a tile apart with odd rows half a tile across, not ${width} × ${height} tiles ${columnStep} × ${rowStep} apart with odd rows ${oddRowShift} across.`
    );
  }

  // The overview draws each tile a brick a quarter as tall as it is wide, as a 2:1 diamond's row step is, so other
  //  shapes are refused until it draws them in their own (#97).
  if (width !== 2 * height) {
    refuse(
      tileset,
      `a staggered isometric tile is twice as wide as it is tall, for now, not ${width} × ${height}.`
    );
  }

  // The map scales a tile by one factor, so the size asked for keeps the tileset's own shape: a diamond squashed or
  //  stretched would put every sprite's pixels in the wrong place.
  if (tileSize.width * height !== tileSize.height * width) {
    refuse(
      tileset,
      `a staggered isometric tile is drawn in its own ${width} × ${height} shape, not ${tileSize.width} × ${tileSize.height}.`
    );
  }

  // Half a tile is a step down and the odd rows' shift across, so it has to be a whole pixel at the size drawn.
  if (tileSize.width % 2 !== 0 || tileSize.height % 2 !== 0) {
    refuse(
      tileset,
      `a staggered isometric tile is drawn an even number of px across and down, not ${tileSize.width} × ${tileSize.height}.`
    );
  }

  // The descriptor's geometry is in native px: across scales with the width, and down with the height.
  const scaleX = tileSize.width / width,
    scaleY = tileSize.height / height,
    // Sprites reach out of their box as far as the overhang says, and as far as the anchor moves a tile-sized sprite:
    //  Civ2's 64 × 48 units and cities sit 16 px up on a 64 × 32 tile.
    reach: Reach = {
      top: Math.max(overhang.top, -anchor.y) * scaleY,
      right: Math.max(overhang.right, anchor.x) * scaleX,
      bottom: Math.max(overhang.bottom, anchor.y) * scaleY,
      left: Math.max(overhang.left, -anchor.x) * scaleX,
    };

  // `columnStep` is the tile's width, so the steps are `tileSize` itself, scaled exactly.
  return new IsoProjection(tileSize, world, wrapVertical, reach);
};

/** The isometric grid's minimap: the world a flat brick a tile in staggered rows, and the map's box over it. */
export const isoOverview: GridOverview = {
  layer: Overview,
  minimap: Minimap,
};

registerGrid('staggered-iso', isoProjection, isoOverview);
