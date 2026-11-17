import { AssetPack } from './packs';
import { AssetStore, assetStore } from '../AssetStore';
import {
  PackState,
  bundledTilesets,
  chosenMapTileset,
  hostedSheet,
  installTilesets,
  installedTilesets,
  interfaceTileset,
  isHosted,
  keepsMetadata,
  mapTileset,
} from './tilesets';
import { interfaceArt } from './interfaceArt';
import { TilesetDescriptor } from '../tilesets/TilesetDescriptor';
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
 * Draws from `tileset`'s sprites once they are there: for a hosted set (#1063), its sheet fetched and cut up into
 *  `store` (`loadHostedPack`), once; for an imported one, at once, as `installPacks` loaded them. Rejects, saying which
 *  art couldn't be loaded and why, when the sheet can't be.
 */
export const ensureTilesetLoaded = async (
  tileset: TilesetDescriptor,
  store: AssetStore = assetStore
): Promise<void> => {
  try {
    await store.loadHostedPack(packFor(tileset));
  } catch (error) {
    throw new Error(
      `${tileset.name} (${tileset.id}) couldn't be loaded: ${
        (error as Error)?.message ?? error
      }`
    );
  }
};

/**
 * Has the art a map on the `topologyId` grid is drawn with (`mapTileset`) ready to draw from (`ensureTilesetLoaded`),
 *  before a game on that grid starts or loads. Rejects, saying why, when it can't be.
 */
export const ensureMapArt = (
  topologyId: string,
  store: AssetStore = assetStore
): Promise<void> => ensureTilesetLoaded(mapTileset(topologyId), store);

// The hosted sets the page draws from as it starts, of those installed: the interface's art when it is one, as the
//  theme's sets before it aren't there, and a set the player chose for a grid's maps. Not the ones a game's map might
//  be drawn with: those are fetched as that game starts (`ensureMapArt`).
const drawnAtStart = (): TilesetDescriptor[] =>
  [
    interfaceArt(),
    ...[...new Set(bundledTilesets().map(({ grid }) => grid))].map((grid) =>
      chosenMapTileset(grid)
    ),
  ].filter(
    (tileset, index, all): tileset is TilesetDescriptor =>
      tileset !== null && isHosted(tileset) && all.indexOf(tileset) === index
  );

/**
 * Loads the sprites of every bundled pack the player imports into `store` beside the interface's (#97), and installs
 *  the ones whose sprites have all been imported (`installTilesets`), with their sprites' anchors from what their
 *  import said (`setSpriteAnchors`). The interface's (Civ1's) is installed unless its sprites are found missing, when
 *  the theme's art falls back to the pixel art (`interfaceArt`); a store that can't be read to say leaves it installed,
 *  as the game starts with it. A hosted set (#1063) is installed as it's declared, and its sheet fetched now only when
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

            // A store that opens but can't be read says nothing of the interface's pack, which stays installed; a
            //  blocked one has nothing imported (`isComplete`), and the pixel art stands in.
            if (complete === null && tileset.id === interfaceTileset().id) {
              return;
            }

            states[tileset.id] = { complete: complete === true, metadata };
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
