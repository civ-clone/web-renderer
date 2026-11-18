import { Reach, Size, WorldDimensions } from '@civ-clone/ui-map/lib/projection';
import {
  GridOverview,
  registerGrid,
  refuse,
} from '@civ-clone/ui-map/lib/projectionFor';
import HexProjection from './HexProjection';
import Minimap from './Minimap';
import Overview from './Overview';
import { TilesetDescriptor } from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';

// The hexagonal grid, made drawable (#94): the page loads this for the map to draw hex tilesets, such as the pixel art's
//  that ships with civ.one (`@civ-clone/ui-tileset-pixelart`, #1063). New games offer it only on a page loaded with
//  `?hex=1` until its overlays and city screen are done (`hiddenGrids`); a save on it loads either way.

/** The projection a hex `tileset` is drawn with, or a refusal for geometry `HexProjection` cannot draw. */
export const hexProjection = (
  tileset: TilesetDescriptor,
  world: WorldDimensions,
  tileSize: Size,
  wrapVertical: boolean
): HexProjection => {
  const {
    tile: { width, height },
    geometry: { columnStep, rowStep, oddRowShift, anchor, overhang },
  } = tileset;

  // Pointy-topped hexes as far apart as they are wide, in rows three quarters of a hex apart, odd rows pushed half a hex
  //  across.
  if (
    columnStep !== width ||
    rowStep * 4 !== height * 3 ||
    oddRowShift * 2 !== width
  ) {
    refuse(
      tileset,
      `a hexagonal grid's tiles are as far apart as they are wide, in rows three quarters of a tile apart with odd rows half a tile across, not ${width} × ${height} tiles ${columnStep} × ${rowStep} apart with odd rows ${oddRowShift} across.`
    );
  }

  // The map scales a tile by one factor, so the size asked for keeps the tileset's own shape.
  if (tileSize.width * height !== tileSize.height * width) {
    refuse(
      tileset,
      `a hexagonal tile is drawn in its own ${width} × ${height} shape, not ${tileSize.width} × ${tileSize.height}.`
    );
  }

  // Half a tile across, and a quarter of one down (the corners, and a row step of three), have to be whole pixels at the
  //  size drawn.
  if (tileSize.width % 2 !== 0 || tileSize.height % 4 !== 0) {
    refuse(
      tileset,
      `a hexagonal tile is drawn an even number of px across and a multiple of 4 px down, not ${tileSize.width} × ${tileSize.height}.`
    );
  }

  // The descriptor's geometry is in native px: across scales with the width, and down with the height.
  const scaleX = tileSize.width / width,
    scaleY = tileSize.height / height,
    // Sprites reach out of their box as far as the overhang says, and as far as the anchor moves a tile-sized sprite.
    reach: Reach = {
      top: Math.max(overhang.top, -anchor.y) * scaleY,
      right: Math.max(overhang.right, anchor.x) * scaleX,
      bottom: Math.max(overhang.bottom, anchor.y) * scaleY,
      left: Math.max(overhang.left, -anchor.x) * scaleX,
    };

  return new HexProjection(tileSize, world, wrapVertical, reach);
};

/** The hexagonal grid's minimap: the world a flat brick a tile in staggered rows, and the map's box over it. */
export const hexOverview: GridOverview = {
  layer: Overview,
  minimap: Minimap,
};

registerGrid('hex-odd-r', hexProjection, hexOverview);
