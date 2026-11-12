import validateDescriptor, {
  Size,
  TilesetDescriptor,
} from '../tilesets/TilesetDescriptor';
import { PackMetadata, isFlagRow } from './packs';
import type { TopologyId } from '@civ-clone/core-world/topologies';
import civ1 from '../tilesets/civ1.json';
import civ2 from '../tilesets/civ2.json';

// The tilesets the map can be drawn with (#56): Civ1's, on the square grid, and Civ2's, on the staggered isometric
//  grid (#97, #152), drawn with the sprites the player imports from their own copy of Civilization II. Both are bundled,
//  but a pack is only installed once its sprites have been imported (`installTilesets`), so the grids a game can be on
//  are the ones the player can see drawn. One pack per grid: the world's grid picks the pack, with no choosing.

const civ1Tileset = validateDescriptor(civ1),
  civ2Tileset = validateDescriptor(civ2);

/** Every tileset this renderer comes with, installed or not: Civ1's first, as the interface's. */
export const bundledTilesets = (): TilesetDescriptor[] => [
  civ1Tileset,
  civ2Tileset,
];

// Civ1's is always installed: the game can't start without its sprites, which the interface is drawn with too.
let installed: TilesetDescriptor[] = [civ1Tileset];

/**
 * The tilesets there are to draw the map with: the grids a game can be on are theirs (`supportedTopologies`). Civ1's,
 *  and each other bundled pack whose sprites have been imported, as `installTilesets` found them at start-up, so this
 *  stays synchronous.
 */
export const installedTilesets = (): TilesetDescriptor[] => [...installed];

/**
 * What each bundled pack needs to be installed, by id: whether every sprite it requires has been imported, and what
 *  its import said about them (`PackMetadata`), for a pack that keeps a record of that.
 */
export interface PackState {
  complete: boolean;
  metadata: PackMetadata | null;
}

/**
 * `tileset` as its import says it is drawn: an overlay colouring whose keys are the colours of the player's own copy's
 *  first flag (`colours.flag[0]` in Civ2's metadata), primary then secondary, in place of the descriptor's, which are
 *  Civ2's own as shipped. The flag is recoloured by swapping exactly those colours, and a copy could differ. Throws
 *  when the import has no such flag, or its colours aren't colours: its cities' flags couldn't be drawn.
 */
export const withImportedKeys = (
  tileset: TilesetDescriptor,
  metadata: PackMetadata | null
): TilesetDescriptor => {
  const { colouring } = tileset.cities;

  if (colouring.mode !== 'overlay') {
    return tileset;
  }

  const row: unknown = metadata?.colours?.flag;

  if (!isFlagRow(row)) {
    throw new TypeError(
      `Tileset "${tileset.id}": its import's flags' colours can't be read.`
    );
  }

  const { primary, secondary } = row[0]!;

  const hex = (colour: number[]): string =>
    `#${colour.map((value) => value.toString(16).padStart(2, '0')).join('')}`;

  return {
    ...tileset,
    cities: {
      ...tileset.cities,
      colouring: {
        ...colouring,
        keys: [hex(primary), hex(secondary)],
      },
    },
  };
};

/**
 * Installs the bundled packs whose `states` say they are complete (Civ1's always is), each as its import says it is
 *  drawn (`withImportedKeys`). A pack that keeps a record of its sprites (`metadata`) is only complete with one: its
 *  units' shields and its cities' flags go where it says, and would be left out without it; and one whose record can't
 *  be drawn from (`withImportedKeys` refuses it) is left out too. Called once the asset store has loaded, at start-up
 *  and after an import.
 */
export const installTilesets = (states: {
  [id: string]: PackState | undefined;
}): TilesetDescriptor[] => {
  installed = bundledTilesets().flatMap((tileset) => {
    if (tileset === civ1Tileset) {
      return [tileset];
    }

    const state = states[tileset.id];

    if (!state?.complete || state.metadata === null) {
      return [];
    }

    // An import whose record can't be drawn from leaves its pack uninstalled, and the rest as they are.
    try {
      return [withImportedKeys(tileset, state.metadata)];
    } catch (error) {
      console.error(error);

      return [];
    }
  });

  return installedTilesets();
};

/**
 * The tileset the map of a world on the `topologyId` grid is drawn with (#97): the installed pack for that grid. One
 *  that isn't installed is drawn with the bundled pack for it, its sprites missing, rather than another grid's: a game
 *  is only started or loaded on a grid with a pack installed (`supportedTopologies`). Throws for a grid no pack is for.
 */
export const mapTileset = (
  topologyId: TopologyId | string = currentGrid
): TilesetDescriptor => {
  const tileset =
    installed.find(({ grid }) => grid === topologyId) ??
    bundledTilesets().find(({ grid }) => grid === topologyId);

  if (tileset === undefined) {
    throw new Error(`No tileset is drawn on the ${topologyId} grid.`);
  }

  return tileset;
};

// The grid of the game being played, for what draws its map's units outside the map (#97: the windows' units follow
//  the map's pack). Square until a game says otherwise.
let currentGrid: TopologyId | string = 'square';

/** Draws the windows' units (`mapTileset()` with no grid) as a map on the `topologyId` grid draws them. */
export const setMapGrid = (
  topologyId: TopologyId | string = 'square'
): void => {
  currentGrid = topologyId;
};

/**
 * The tileset the square map is drawn with, and the interface's (`interfaceTileset`): Civ1's. What the map draws with
 *  follows the world's grid (`mapTileset`).
 */
export const currentTileset = (): TilesetDescriptor => civ1Tileset;

/**
 * The tileset the interface's own art comes from, wherever it is drawn: the yields, citizens and other icons the map's
 *  layers draw over its tiles as well as the windows' (#97, #152). Civ1's, which every game has imported, whatever pack
 *  the map is drawn with: a map pack need not have any interface art of its own.
 */
export const interfaceTileset = (): TilesetDescriptor => civ1Tileset;

/**
 * `tileset`'s native tile size in px, across and down, as the map takes it: the map scales both by its scale. A grid
 * draws only the sizes its projection can lay out, and refuses the rest when it is asked for one (`projectionFor`).
 */
export const nativeTileSize = ({
  tile: { width, height },
}: TilesetDescriptor): Size => ({ width, height });

/**
 * The option the map scale is kept under for `tileset` (#97): Civ1's is `mapScale`, as it always has been, and
 *  another pack's its own, as its scales are its own (Civ2's 64 px tile at 1× is Civ1's at 4×).
 */
export const mapScaleOption = ({ id }: TilesetDescriptor): string =>
  id === civ1Tileset.id ? 'mapScale' : `mapScale.${id}`;

/** `scale` if `tileset` can be shown at it, its default scale if not (a scale kept from before, or another pack's). */
export const scaleFor = (tileset: TilesetDescriptor, scale: unknown): number =>
  typeof scale === 'number' && tileset.scales.includes(scale)
    ? scale
    : tileset.defaultScale;

/**
 * The scale a window shows `tileset`'s art at when asked for `scale`, which is Civ1's (#97): as asked for Civ1's 16 px
 *  tile, and no more than the pack's own default scale for a larger tile, so Civ2's 64 × 48 units and its city map are
 *  shown at their own size rather than twice it.
 */
export const shownScale = (scale: number, tileset: TilesetDescriptor): number =>
  tileset.tile.width > civ1Tileset.tile.width
    ? Math.min(scale, tileset.defaultScale)
    : scale;

export default currentTileset;
