import { Size, TilesetDescriptor } from '../tilesets/TilesetDescriptor';
import { PackMetadata, isFlagRow } from './packs';
import type { TopologyId } from '@civ-clone/core-world/topologies';

// The tilesets the map can be drawn with (#56), as their packages register them (#97): one the interface's (such as
//  `@civ-clone/ui-tileset-civ1`), and others for other grids (#152), each drawn with the sprites the player imports from
//  their own copy of the game it comes from. Each is bundled, but a pack is only installed once its sprites have been
//  imported (`installTilesets`), so the grids a game can be on are the ones the player can see drawn. One pack per
//  grid: the world's grid picks the pack, with no choosing.

/** What a pack's package says of it as it registers it (`registerTileset`), besides its descriptor. */
export interface TilesetOptions {
  /**
   * Whether the interface's own art comes from it (`interfaceTileset`): then it is always installed, and the asset
   *  store is ready, and the game can start, only once every sprite it requires has been imported. One pack is.
   */
  interface?: boolean;
  /** Whether its import keeps a record of its sprites beside them (`PackMetadata`), as some packs' do. */
  metadata?: boolean;
}

const registered: { tileset: TilesetDescriptor; options: TilesetOptions }[] =
  [];

/**
 * Bundles `tileset` (#97): its package calls this as it is loaded, before anything is drawn, as the page loads it
 *  (`src/js/frontend.ts`). Throws for a second pack with the same id, or a second interface pack.
 */
export const registerTileset = (
  tileset: TilesetDescriptor,
  options: TilesetOptions = {}
): TilesetDescriptor => {
  if (registered.some(({ tileset: { id } }) => id === tileset.id)) {
    throw new Error(`Tileset "${tileset.id}" is registered already.`);
  }

  if (
    options.interface &&
    registered.some(({ options }) => options.interface)
  ) {
    throw new Error(
      `Tileset "${tileset.id}" can't be the interface's: "${
        interfaceTileset().id
      }" is.`
    );
  }

  registered.push({ tileset, options });

  return tileset;
};

/** Whether `tileset`'s import keeps a record of its sprites beside them (`TilesetOptions.metadata`). */
export const keepsMetadata = ({ id }: Pick<TilesetDescriptor, 'id'>): boolean =>
  registered.some(
    ({ tileset, options }) => tileset.id === id && options.metadata === true
  );

/**
 * The tileset the interface's own art comes from, wherever it is drawn: the yields, citizens and other icons the map's
 *  layers draw over its tiles as well as the windows' (#97, #152). Civ1's, which every game has imported, whatever pack
 *  the map is drawn with: a map pack need not have any interface art of its own. Throws when no package has registered
 *  one.
 */
export const interfaceTileset = (): TilesetDescriptor => {
  const tileset = registered.find(({ options }) => options.interface)?.tileset;

  if (tileset === undefined) {
    throw new Error(
      'No interface tileset is registered: load its package (such as @civ-clone/ui-tileset-civ1) before anything is drawn.'
    );
  }

  return tileset;
};

/** Every tileset this renderer comes with, installed or not: the interface's first. */
export const bundledTilesets = (): TilesetDescriptor[] => [
  interfaceTileset(),
  ...registered
    .filter(({ options }) => !options.interface)
    .map(({ tileset }) => tileset),
];

// The interface's is always installed: the game can't start without its sprites. Null until `installTilesets` has
//  found which others are, at start-up.
let installed: TilesetDescriptor[] | null = null;

/**
 * The tilesets there are to draw the map with: the grids a game can be on are theirs (`supportedTopologies`). The
 *  interface's, and each other bundled pack whose sprites have been imported, as `installTilesets` found them at
 *  start-up, so this stays synchronous.
 */
export const installedTilesets = (): TilesetDescriptor[] => [
  ...(installed ?? [interfaceTileset()]),
];

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
 *  first flag (`colours.flag[0]` in its `PackMetadata`), primary then secondary, in place of the descriptor's, which
 *  are the pack's own as shipped. The flag is recoloured by swapping exactly those colours, and a copy could differ.
 *  Throws when the import has no such flag, or its colours aren't colours: its cities' flags couldn't be drawn.
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
 * Installs the bundled packs whose `states` say they are complete (the interface's always is), each as its import
 *  says it is drawn (`withImportedKeys`). A pack that keeps a record of its sprites (`metadata`) is only complete with
 *  one: its units' shields and its cities' flags go where it says, and would be left out without it; and one whose
 *  record can't be drawn from (`withImportedKeys` refuses it) is left out too. Called once the asset store has
 *  loaded, at start-up and after an import.
 */
export const installTilesets = (states: {
  [id: string]: PackState | undefined;
}): TilesetDescriptor[] => {
  const interfaceId = interfaceTileset().id;

  installed = bundledTilesets().flatMap((tileset) => {
    if (tileset.id === interfaceId) {
      return [tileset];
    }

    const state = states[tileset.id];

    // A pack that keeps no record of its sprites (`metadata` not set as it registered) needs only its sprites.
    if (
      !state?.complete ||
      (keepsMetadata(tileset) && state.metadata === null)
    ) {
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
    installedTilesets().find(({ grid }) => grid === topologyId) ??
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
export const currentTileset = (): TilesetDescriptor => interfaceTileset();

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
  id === interfaceTileset().id ? 'mapScale' : `mapScale.${id}`;

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
  tileset.tile.width > interfaceTileset().tile.width
    ? Math.min(scale, tileset.defaultScale)
    : scale;

export default currentTileset;
