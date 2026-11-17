import { AssetPack } from './packs';
import { AssetStore, assetStore } from '../AssetStore';
import {
  PackState,
  bundledTilesets,
  hostedSheet,
  installTilesets,
  interfaceTileset,
  isHosted,
  keepsMetadata,
} from './tilesets';
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
 * Loads the sprites of every bundled pack into `store` beside the interface's (#97), and installs the ones whose
 *  sprites have all been imported (`installTilesets`), with their sprites' anchors from what their import said
 *  (`setSpriteAnchors`), and the hosted sets whose sheets have loaded (#1063). The interface's (Civ1's) is installed
 *  unless its sprites are found missing, when the theme's art falls back to the pixel art (`interfaceArt`). At
 *  start-up, before anything is drawn, and again whenever the sprites change. Resolves with the installed tilesets,
 *  and never rejects: a pack that can't be read is left uninstalled, and the game starts with the others, whose sprites
 *  the store loads whatever happens to another's.
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
      bundled.map(async (tileset): Promise<void> => {
        try {
          const pack = packFor(tileset),
            metadata = store.metadata(pack);

          if (metadata !== null) {
            setSpriteAnchors(tileset.id, metadata.anchors ?? {});
          }

          states[tileset.id] = {
            complete: await store.hasAllAssets(pack),
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

    // A hosted set's sprites are only there once its sheet has loaded.
    bundled
      .filter((tileset) => isHosted(tileset) && !(tileset.id in states))
      .forEach((tileset) => {
        states[tileset.id] = { complete: false, metadata: null };
      });
  }

  return installTilesets(states);
};

export default installPacks;
