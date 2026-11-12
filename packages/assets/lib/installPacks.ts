import { AssetPack } from './packs';
import { AssetStore, assetStore } from '../AssetStore';
import {
  PackState,
  bundledTilesets,
  installTilesets,
  interfaceTileset,
  keepsMetadata,
} from './tilesets';
import { TilesetDescriptor } from '../tilesets/TilesetDescriptor';
import { setSpriteAnchors } from './spriteAnchors';

/** `tileset` as the asset store loads it: its sprites, and whether its import keeps a record of them. */
export const packFor = (tileset: TilesetDescriptor): AssetPack => ({
  id: tileset.id,
  storage: tileset.storage,
  assets: tileset.assets,
  // Civ2's, whose units' shields and cities' flags go where the player's own copy marks them (#97).
  metadata: keepsMetadata(tileset),
});

/**
 * Loads the sprites of every bundled pack into `store` beside the interface's (#97), and installs the ones whose
 *  sprites have all been imported (`installTilesets`), with their sprites' anchors from what their import said
 *  (`setSpriteAnchors`). At start-up, before anything is drawn, and again whenever the sprites change. Resolves with
 *  the installed tilesets, and never rejects: a pack that can't be read is left uninstalled, and the game starts with
 *  the interface's (Civ1's), whose sprites the store loads whatever happens to another's.
 */
export const installPacks = async (
  store: AssetStore = assetStore
): Promise<TilesetDescriptor[]> => {
  const others = bundledTilesets().filter(
      (tileset) => tileset.id !== interfaceTileset().id
    ),
    states: { [id: string]: PackState } = {};

  try {
    others.forEach((tileset) => store.addPack(packFor(tileset)));

    await store.load();

    await Promise.all(
      others.map(async (tileset): Promise<void> => {
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
  }

  return installTilesets(states);
};

export default installPacks;
