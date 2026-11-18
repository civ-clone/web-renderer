import { AssetPack } from './packs';
import { AssetStore, assetStore } from '../AssetStore';
import {
  PackState,
  bundledTilesets,
  chooseMapTileset,
  chosenMapTileset,
  hiddenGrids,
  hostedSheet,
  installTilesets,
  installedTilesets,
  interfaceTileset,
  isHosted,
  keepsMetadata,
  mapTileset,
  reinstallHostedTileset,
  ruleSetMapTileset,
  setSheetFailed,
  sheetFailure,
} from './tilesets';
import { interfaceArt } from './interfaceArt';
import { TilesetDescriptor, spriteKey } from '../tilesets/TilesetDescriptor';
import { setSpriteAnchors } from './spriteAnchors';

/**
 * `tileset` as the asset store loads it: its sprites, whether its import keeps a record of them, and, for a hosted set
 *  (#1063), the sheet they come from.
 */
export const packFor = (tileset: TilesetDescriptor): AssetPack => {
  const hosted = hostedSheet(tileset);

  return {
    id: tileset.id,
    storage: tileset.storage,
    assets: tileset.assets,
    // One whose units' shields and cities' flags go where the player's own copy marks them (#97).
    metadata: keepsMetadata(tileset),
    ...(hosted === null ? {} : { hosted }),
  };
};

/**
 * Whether the last try to load `tileset`'s sheet, a hosted set's, failed (`ensureTilesetLoaded`): at start-up, or as a
 *  game on its grid started. False for one not tried yet, which counts as there until it is (#1063).
 */
export const loadFailed = ({ id }: Pick<TilesetDescriptor, 'id'>): boolean =>
  sheetFailure(id) !== null;

/**
 * Draws from `tileset`'s sprites once they are there: for a hosted set (#1063), its sheet fetched and cut up into
 *  `store` (`loadHostedPack`), once; for an imported one, at once, as `installPacks` loaded them. Rejects, saying which
 *  art couldn't be loaded and why, when the sheet can't be, which `loadFailed` says until a later try loads it.
 */
export const ensureTilesetLoaded = async (
  tileset: TilesetDescriptor,
  store: AssetStore = assetStore
): Promise<void> => {
  try {
    await store.loadHostedPack(packFor(tileset));
    setSheetFailed(tileset.id, null);
  } catch (error) {
    const reason = String((error as Error)?.message ?? error);

    setSheetFailed(tileset.id, reason);

    throw new Error(
      `${tileset.name} (${tileset.id}) couldn't be loaded: ${reason}`
    );
  }
};

/** What a map on a grid is drawn with as a game starts or loads (`ensureMapArt`), and the art it fell back from. */
export type MapArt = {
  /** The set the map is drawn with. */
  tileset: TilesetDescriptor;
  /** The sets passed over as their sheets couldn't be loaded, with why. */
  failed: { tileset: TilesetDescriptor; reason: string }[];
};

/**
 * Has the art a map on the `topologyId` grid is drawn with (`mapTileset`) ready to draw from (`ensureTilesetLoaded`),
 *  before a game on that grid starts or loads. A hosted set whose sheet can't be loaded, offline say, is passed over
 *  for the next set ready for the grid (#1141), and resolves saying which were. Each set for the grid is tried again
 *  first, a hosted one left uninstalled as its sheet failed as the page started among them, installed again once it
 *  loads. Rejects, saying why, when a set failed and none is left installed for the grid to draw with.
 */
export const ensureMapArt = async (
  topologyId: string,
  store: AssetStore = assetStore
): Promise<MapArt> => {
  const failed: MapArt['failed'] = [],
    tried = async (tileset: TilesetDescriptor): Promise<boolean> => {
      try {
        await ensureTilesetLoaded(tileset, store);

        return true;
      } catch (error) {
        failed.push({
          tileset,
          reason: sheetFailure(tileset.id) ?? String(error),
        });

        return false;
      }
    };

  // A game's start is a new try for each set for the grid, in case its sheet can be loaded now.
  installedTilesets()
    .filter(({ grid }) => grid === topologyId)
    .forEach(({ id }) => setSheetFailed(id, null));

  // And for a hosted one whose sheet failed as the page started, which was left uninstalled: unless the rule set's own
  //  art is drawn on the grid, whatever happens to it.
  if (ruleSetMapTileset(topologyId) === null) {
    const installed = installedTilesets();

    for (const tileset of bundledTilesets().filter(
      (bundled) =>
        bundled.grid === topologyId &&
        isHosted(bundled) &&
        !installed.includes(bundled) &&
        sheetFailure(bundled.id) !== null
    )) {
      if (await tried(tileset)) {
        reinstallHostedTileset(tileset);
      }
    }
  }

  for (;;) {
    const tileset = mapTileset(topologyId),
      [first] = failed;

    // A set failed, and what's left for the grid is its bundled pack, uninstalled or failed too: there's nothing to
    //  draw with, which is said by the first that failed.
    if (
      first !== undefined &&
      (sheetFailure(tileset.id) !== null ||
        !installedTilesets().includes(tileset))
    ) {
      throw new Error(
        `${first.tileset.name} (${first.tileset.id}) couldn't be loaded: ${first.reason}`
      );
    }

    if (await tried(tileset)) {
      // Only those passed over for another: one tried again as the page's start failed, and drawn now, isn't.
      return {
        tileset,
        failed: failed.filter((entry) => entry.tileset.id !== tileset.id),
      };
    }
  }
};

/**
 * Chooses the installed set `id` as the art for the `grid` grid's maps (`chooseMapTileset`), once it's ready to draw
 *  from (`ensureTilesetLoaded`): a game on that grid draws its map with it as soon as it's chosen (#1118), so a hosted
 *  set's sheet is fetched first. Rejects, saying why, and leaves the choice as it was, when it can't be loaded; and
 *  leaves it too when, by then, `stillWanted` says another has been chosen since.
 */
export const useMapArt = async (
  grid: string,
  id: string,
  store: AssetStore = assetStore,
  stillWanted: () => boolean = () => true
): Promise<void> => {
  const tileset = installedTilesets().find(
    (installed) => installed.grid === grid && installed.id === id
  );

  if (tileset === undefined) {
    throw new Error(`No ${id} set is installed for the ${grid} grid.`);
  }

  await ensureTilesetLoaded(tileset, store);

  if (stillWanted()) {
    chooseMapTileset(grid, id);
  }
};

// Whether every sprite `pack` requires was read into `store` by its last `load`, whatever the store says it holds.
const spritesLoaded = async (
  store: AssetStore,
  pack: AssetPack
): Promise<boolean> =>
  (
    await Promise.all(
      pack.assets.required.map((name) => store.has(spriteKey(pack, name)))
    )
  ).every(Boolean);

// The hosted sets the page draws from as it starts, of those installed: the interface's art when it is one, as the
//  theme's sets before it aren't there, and a set the player chose for a grid's maps, but a grid new games don't
//  offer (`hiddenGrids`). Not the ones a game's map might be drawn with: those are fetched as that game starts
//  (`ensureMapArt`).
const drawnAtStart = (): TilesetDescriptor[] =>
  [
    interfaceArt(),
    ...[...new Set(bundledTilesets().map(({ grid }) => grid))]
      .filter((grid) => !hiddenGrids().includes(grid))
      .map((grid) => chosenMapTileset(grid)),
  ].filter(
    (tileset, index, all): tileset is TilesetDescriptor =>
      tileset !== null && isHosted(tileset) && all.indexOf(tileset) === index
  );

/**
 * Loads the sprites of every bundled pack the player imports into `store` beside the interface's (#97), and installs
 *  the ones whose sprites have all been imported (`installTilesets`), with their sprites' anchors from what their
 *  import said (`setSpriteAnchors`). The interface's (Civ1's) is installed unless its sprites are found missing, when
 *  the theme's art falls back to the pixel art (`interfaceArt`); a store that can't be read to say leaves it installed
 *  only when its sprites were read all the same. A hosted set (#1063) is installed as it's declared, and its sheet fetched now only when
 *  the page draws from it as it starts (the interface's art, or a grid's chosen art): one that fails then is left
 *  uninstalled, which is said. At start-up, before anything is drawn, and again whenever the sprites change. Resolves
 *  with the installed tilesets, and never rejects: a pack that can't be read is left uninstalled, and the game starts
 *  with the others, whose sprites the store loads whatever happens to another's.
 */
export const installPacks = async (
  store: AssetStore = assetStore
): Promise<TilesetDescriptor[]> => {
  const bundled = bundledTilesets(),
    states: { [id: string]: PackState } = {};

  try {
    bundled
      .filter((tileset) => tileset.id !== interfaceTileset().id)
      .forEach((tileset) => store.addPack(packFor(tileset)));

    await store.load();

    await Promise.all(
      bundled
        .filter((tileset) => !isHosted(tileset))
        .map(async (tileset): Promise<void> => {
          try {
            const pack = packFor(tileset),
              metadata = store.metadata(pack),
              complete = await store.isComplete(pack);

            if (metadata !== null) {
              setSpriteAnchors(tileset.id, metadata.anchors ?? {});
            }

            // A store that opens but can't be read to say leaves the interface's pack installed when its sprites were
            //  read all the same (`load`), so it draws as before; and uninstalled when they weren't, so the pixel art
            //  stands in rather than a game drawn blank. A blocked one has nothing imported (`isComplete`), and the
            //  pixel art stands in.
            states[tileset.id] = {
              complete:
                complete === null && tileset.id === interfaceTileset().id
                  ? await spritesLoaded(store, pack)
                  : complete === true,
              metadata,
            };
          } catch (error) {
            console.error(
              `Could not install the ${tileset.name} tileset.`,
              error
            );
          }
        })
    );
  } catch (error) {
    console.error('Could not load the tilesets.', error);
  }

  installTilesets(states);

  // Each hosted set drawn from as the page starts, once each: one that can't be loaded is uninstalled, and what's drawn
  //  is settled again without it.
  for (
    let wanted = drawnAtStart();
    wanted.length > 0;
    wanted = drawnAtStart().filter(({ id }) => !(id in states))
  ) {
    for (const tileset of wanted) {
      try {
        await ensureTilesetLoaded(tileset, store);
        states[tileset.id] = { complete: true, metadata: null };
      } catch (error) {
        console.error(`Could not load the ${tileset.id} set's sheet.`, error);
        states[tileset.id] = { complete: false, metadata: null };
      }
    }

    installTilesets(states);
  }

  return installedTilesets();
};

export default installPacks;
