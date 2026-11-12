import { Tile } from '@civ-clone/ui-protocol/types';

// What every grid's overview has in common (#867): the square grid's and the isometric grid's minimaps show the same
//  world in the same slot, so they fit the same width and colour it the same.

// The width the minimap is given in the sidebar. Each grid's overview picks the largest whole number of pixels per
// tile that fits, so tiles always land on whole pixels and the canvas is displayed without a fractional downscale.
export const OVERVIEW_WIDTH = 190;

export const landColour = '#58a038',
  waterColour = '#2848a0',
  // One flat colour per terrain, rather than a downscale of the tile sprites:
  // at two or three pixels a tile there is nothing legible in a sprite to keep.
  // These belong in a theme manifest once there is one (#39/#56).
  terrainColours: { [terrain: string]: string } = {
    Arctic: '#f0f0f0',
    Desert: '#e0c070',
    Forest: '#286028',
    Grassland: landColour,
    Hills: '#889040',
    Jungle: '#386828',
    Mountains: '#888078',
    Ocean: waterColour,
    Plains: '#b0a048',
    River: '#4878b0',
    Swamp: '#4c6040',
    Tundra: '#c0c0a0',
  };

/** The colour an overview draws `tile` in. */
export const terrainColour = (tile: Tile): string =>
  terrainColours[tile.terrain._] ??
  // Terrains come from a registry that plugins extend, so anything the
  // table does not know still gets land or water rather than a hole.
  (tile.isWater ? waterColour : landColour);

export default terrainColour;
