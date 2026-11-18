import { HostedSheet, PackMetadata, isFlagRow } from './packs';
import { Size, TilesetDescriptor } from '../tilesets/TilesetDescriptor';
import type { TopologyId } from '@civ-clone/core-world/topologies';
import { instance as gameOptions } from '@civ-clone/ui-platform/GameOptionsRegistry';

// The tilesets the map can be drawn with (#56), as their packages register them (#97): one the interface's (such as
//  `@civ-clone/ui-tileset-civ1`), others for other grids (#152), each drawn with the sprites the player imports from
//  their own copy of the game it comes from, and those that ship with civ.one (#1063), served as a sheet beside it
//  (`source: "hosted"`). Each is bundled, but an imported pack is only installed once its sprites have been imported
//  (`installTilesets`), so the grids a game can be on are the ones the player can see drawn. A hosted one is installed
//  as it is declared, unless its sheet couldn't be loaded. The map of a grid is drawn with the set the player chose for
//  it, or the one imported for it, or the one that ships (`mapTileset`).

/** What a pack's package says of it as it registers it (`registerTileset`), besides its descriptor. */
export interface TilesetOptions {
  /**
   * Whether the interface's own art comes from it (`interfaceTileset`), when the theme's art has none of its own
   *  (`interfaceArt`): then it is installed unless its sprites are found missing (`installPacks`), and the asset
   *  store is ready, and the game can start, only once every sprite it requires has been imported. One pack is.
   */
  interface?: boolean;
  /** Whether its import keeps a record of its sprites beside them (`PackMetadata`), as some packs' do. */
  metadata?: boolean;
  /** For a hosted set (`source: "hosted"`, #1063), where its sheet and its index are. */
  hosted?: HostedSheet;
}

const registered: { tileset: TilesetDescriptor; options: TilesetOptions }[] =
  [];

/**
 * Bundles `tileset` (#97): its package calls this as it is loaded, before anything is drawn, as the page loads it
 *  (`src/js/frontend.ts`). Throws for a second pack with the same id, a second interface pack, or a hosted set without
 *  its sheet (or a sheet for one that isn't hosted).
 */
export const registerTileset = (
  tileset: TilesetDescriptor,
  options: TilesetOptions = {}
): TilesetDescriptor => {
  if (registered.some(({ tileset: { id } }) => id === tileset.id)) {
    throw new Error(`Tileset "${tileset.id}" is registered already.`);
  }

  if (isHosted(tileset) !== (options.hosted !== undefined)) {
    throw new Error(
      isHosted(tileset)
        ? `Tileset "${tileset.id}" is hosted, and has no sheet to load: build the hosted sets (tools/hosted-sets.js).`
        : `Tileset "${tileset.id}" has a sheet, and isn't hosted.`
    );
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
  settledMaps.clear();

  return tileset;
};

/** Whether `tileset` ships with civ.one, served as a sheet beside it (#1063), rather than imported from the player's own copy. */
export const isHosted = ({
  source,
}: Pick<TilesetDescriptor, 'source'>): boolean => source === 'hosted';

/** Where a hosted `tileset`'s sheet and index are (`TilesetOptions.hosted`), or null for one that's imported. */
export const hostedSheet = ({
  id,
}: Pick<TilesetDescriptor, 'id'>): HostedSheet | null =>
  registered.find(({ tileset }) => tileset.id === id)?.options.hosted ?? null;

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

// The interface's alone until `installTilesets` has found which are, at start-up.
let installed: TilesetDescriptor[] | null = null;

// What's told when `installTilesets` changes which are installed: what keeps a set chosen from them (`interfaceArt`).
const installedHandlers = new Set<() => void>();

/** Calls `handler` whenever `installTilesets` installs the bundled packs again. */
export const onTilesetsInstalled = (handler: () => void): void => {
  installedHandlers.add(handler);
};

/**
 * The tilesets there are to draw the map with: the grids a game can be on are theirs (`supportedTopologies`). The
 *  interface's, each other bundled pack whose sprites have been imported, and each hosted set whose sheet has loaded,
 *  as `installTilesets` found them at start-up, so this stays synchronous.
 */
export const installedTilesets = (): TilesetDescriptor[] => [
  ...(installed ?? [interfaceTileset()]),
];

/**
 * What each bundled pack needs to be installed, by id: whether every sprite it requires has been imported (or, for a
 *  hosted set, is in its sheet, which has loaded), and what its import said about them (`PackMetadata`), for a pack
 *  that keeps a record of that.
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
 * Installs the bundled packs whose `states` say they are complete, each imported one as its import says it is drawn
 *  (`withImportedKeys`). A pack that keeps a record of its sprites (`metadata`) is only complete with one: its units'
 *  shields and its cities' flags go where it says, and would be left out without it; and one whose record can't be
 *  drawn from (`withImportedKeys` refuses it) is left out too. The interface's pack and each hosted set (#1063) are
 *  installed unless their `states` say they aren't complete: a hosted set as it is declared, with its descriptor's own
 *  colours (it has no import to have recorded others), unless its sheet couldn't be loaded. Called once the asset
 *  store has loaded, at start-up and after an import.
 */
export const installTilesets = (states: {
  [id: string]: PackState | undefined;
}): TilesetDescriptor[] => {
  const interfaceId = interfaceTileset().id;

  settledMaps.clear();

  installed = bundledTilesets().flatMap((tileset) => {
    const state = states[tileset.id];

    if (tileset.id === interfaceId || isHosted(tileset)) {
      return state?.complete === false ? [] : [tileset];
    }

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

  installedHandlers.forEach((handler) => handler());

  return installedTilesets();
};

/**
 * Installs `tileset` again, a hosted set left uninstalled as its sheet couldn't be loaded as the page started
 *  (`installPacks`), once it has been (#1141). Nothing for one that's installed, or isn't hosted.
 */
export const reinstallHostedTileset = (tileset: TilesetDescriptor): void => {
  const now = installedTilesets();

  if (!isHosted(tileset) || now.includes(tileset)) {
    return;
  }

  // In the bundled order, each installed one as it was installed (an imported one with its import's keys).
  installed = bundledTilesets().flatMap((bundled) =>
    bundled === tileset
      ? [tileset]
      : now.filter((installedOne) => installedOne.id === bundled.id)
  );
  settledMaps.clear();
  installedHandlers.forEach((handler) => handler());
};

/** The option the art the player chose for the `grid` grid's maps is kept under (#1063): `tileset.<grid>`, a set's id. */
export const mapTilesetOption = (grid: TopologyId | string): string =>
  `tileset.${grid}`;

// What `mapTileset` settled on for each grid, as the map's layers ask on every draw: settled again once the installed
//  sets, the choice, or the game's rule set's art change.
const settledMaps = new Map<string, TilesetDescriptor>();

gameOptions.onChange((key) => {
  if (key.startsWith('tileset.')) {
    settledMaps.clear();
  }
});

// The hosted sets whose sheet the last try couldn't load, by id, with why (#1063): a map isn't drawn with one while it
//  can't be, but with the next set ready for its grid (#1141).
const unloadedSheets = new Map<string, string>();

/**
 * Notes that `id`'s sheet, a hosted set's, couldn't be loaded, and why, or, given null, that it has been: a map is drawn
 *  with another set for its grid until it is (`mapTileset`).
 */
export const setSheetFailed = (id: string, reason: string | null): void => {
  if (reason === null) {
    if (unloadedSheets.delete(id)) {
      settledMaps.clear();
    }

    return;
  }

  unloadedSheets.set(id, reason);
  settledMaps.clear();
};

/** Why `id`'s sheet couldn't be loaded the last time it was tried, or null when it has been, or hasn't been tried. */
export const sheetFailure = (id: string): string | null =>
  unloadedSheets.get(id) ?? null;

// The art the game's rule set names (`civ-clone.sets.<id>.tileset`, Civ2's), when the page knows it: see
//  `setRuleSetTileset`.
let ruleSetTileset: string | null = null;

/**
 * Has the map drawn with `id`, the art the rule set of the game about to be played names (Civ2's `civ2`), on its grid,
 *  over the player's choice for that grid (decision 2 of docs/asset-library.md); or, given null, for a rule set that
 *  names none, with the player's choice again.
 */
export const setRuleSetTileset = (id: string | null): void => {
  ruleSetTileset = id;
  settledMaps.clear();
};

/**
 * The installed set the rule set of the game being played names for the `grid` grid's maps (`setRuleSetTileset`), which
 *  outranks the player's choice there, or null when it names none for that grid.
 */
export const ruleSetMapTileset = (
  grid: TopologyId | string
): TilesetDescriptor | null =>
  ruleSetTileset === null
    ? null
    : installedTilesets().find(
        (tileset) => tileset.grid === grid && tileset.id === ruleSetTileset
      ) ?? null;

/** The installed set the player chose for the `grid` grid's maps (`mapTilesetOption`), or null without one. */
export const chosenMapTileset = (
  grid: TopologyId | string
): TilesetDescriptor | null => {
  const chosen: unknown = gameOptions.get(mapTilesetOption(grid), '');

  return (
    installedTilesets().find(
      (tileset) => tileset.grid === grid && tileset.id === chosen
    ) ?? null
  );
};

// The rule set's art for `topologyId`, or the installed set the player chose for it, or the one imported for it, or the
//  one that ships with civ.one, of those whose sheet hasn't failed to load (#1141); or, with none, the bundled one.
const settleMapTileset = (
  topologyId: string
): TilesetDescriptor | undefined => {
  const installed = installedTilesets().filter(
      ({ grid, id }) => grid === topologyId && !unloadedSheets.has(id)
    ),
    chosen = chosenMapTileset(topologyId);

  return (
    installed.find(({ id }) => id === ruleSetTileset) ??
    (chosen === null || unloadedSheets.has(chosen.id) ? null : chosen) ??
    installed.find((tileset) => !isHosted(tileset)) ??
    installed[0] ??
    bundledTilesets().find(({ grid }) => grid === topologyId)
  );
};

/**
 * The tileset the map of a world on the `topologyId` grid is drawn with (#97, #1063): the art the game's rule set
 *  names (`setRuleSetTileset`), or the installed set for that grid that the player chose (`mapTilesetOption`), or,
 *  until they choose one, the one imported for it, and otherwise the one that ships with civ.one. So a player who has
 *  imported Civ1's art sees the square map drawn with it, as before. A set whose sheet couldn't be loaded is passed
 *  over (`setSheetFailed`) until it is, so the map falls back to the next (#1141). A hosted set's sprites are there once its sheet
 *  has loaded (`ensureTilesetLoaded`), which a game on its grid waits for. A grid with none installed is drawn with the
 *  bundled pack for it, its sprites missing, rather than another grid's: a game is only started or loaded on a grid
 *  with a pack installed (`drawnTopologies`). Throws for a grid no pack is for.
 */
export const mapTileset = (
  topologyId: TopologyId | string = currentGrid
): TilesetDescriptor => {
  const tileset = settledMaps.get(topologyId) ?? settleMapTileset(topologyId);

  if (tileset === undefined) {
    throw new Error(`No tileset is drawn on the ${topologyId} grid.`);
  }

  settledMaps.set(topologyId, tileset);

  return tileset;
};

/**
 * Keeps `id`, a set's id, as the player's choice of art for the `grid` grid's maps (`mapTilesetOption`), or forgets
 *  the choice with `''`: `mapTileset` settles on it the next time it is asked.
 */
export const chooseMapTileset = (grid: TopologyId | string, id: string): void =>
  gameOptions.set(mapTilesetOption(grid), id);

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
 * Civ1's tileset, the pack registered as the interface's (`interfaceTileset`), whether or not it's imported. Nothing
 *  draws with it by this name since #1063: the map draws with `mapTileset`, for the world's grid, and the interface
 *  with `interfaceArt`, the theme's.
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
 * The option the map's zoom is kept under for `tileset` (#1063): `zoom.<id>`, each set's its own, as its tiles are its
 *  own size (Civ2's 64 px tile at 1× is Civ1's at 4×).
 */
export const zoomOption = ({ id }: Pick<TilesetDescriptor, 'id'>): string =>
  `zoom.${id}`;

/** The steps the zoom moves in: a tenth. */
export const ZOOM_STEP = 0.1;

/** `zoom` to the nearest step (`ZOOM_STEP`), so arithmetic's 2.0000000001 is 2. */
export const snapZoom = (zoom: number): number => Math.round(zoom * 10) / 10;

/** The zooms `tileset` can be shown at (#1063): from its smallest scale to its largest. */
export const zoomRange = ({
  scales,
}: Pick<TilesetDescriptor, 'scales'>): { min: number; max: number } => ({
  min: Math.min(...scales),
  max: Math.max(...scales),
});

/** The zoom a player starts `tileset` on: its `defaultZoom`, or its `defaultScale` where it names none. */
export const defaultZoom = (
  tileset: Pick<TilesetDescriptor, 'defaultScale' | 'defaultZoom'>
): number => tileset.defaultZoom ?? tileset.defaultScale;

/**
 * `zoom`, kept within what `tileset` can be shown at (`zoomRange`) and to a step, or its default zoom if it isn't a
 *  number (a value kept from before that can't be read).
 */
export const zoomFor = (tileset: TilesetDescriptor, zoom: unknown): number => {
  if (typeof zoom !== 'number' || !Number.isFinite(zoom)) {
    return defaultZoom(tileset);
  }

  const { min, max } = zoomRange(tileset);

  return snapZoom(Math.min(max, Math.max(min, zoom)));
};

/**
 * The option each kept map scale (`mapScale` for Civ1's, `mapScale.<id>` for another set's) has become (#1063): the
 *  set's zoom (`zoomOption`). Null for any other option.
 */
export const zoomOptionFromMapScale = (key: string): string | null => {
  if (key === 'mapScale') {
    return zoomOption({ id: 'civ1' });
  }

  const [, id] = key.match(/^mapScale\.(.+)$/) ?? [];

  return id === undefined ? null : zoomOption({ id });
};

/** The tile, in px across, that windows are laid out for (#1063): their scales are a 16 px tile's. */
export const REFERENCE_TILE_WIDTH = 16;

/**
 * The scale a window shows `tileset`'s art at when asked for `scale`, which is a 16 px tile's (#97,
 *  `REFERENCE_TILE_WIDTH`): as asked for such a tile, and no more than the pack's own default scale for a larger tile,
 *  so Civ2's 64 × 48 units, the pixel art's 32 px ones and their city maps are shown at their own size rather than
 *  twice it.
 */
export const shownScale = (scale: number, tileset: TilesetDescriptor): number =>
  tileset.tile.width > REFERENCE_TILE_WIDTH
    ? Math.min(scale, tileset.defaultScale)
    : scale;

export default currentTileset;
