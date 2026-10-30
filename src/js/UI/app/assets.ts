import { assetStore } from '../AssetStore';
import currentTileset from '../lib/tilesets';
import { TilesetDescriptor, spriteKey } from '../tilesets/TilesetDescriptor';

/**
 * The sizes `tileset` shows its sprites at outside the map (#729), as custom properties on `:root` for the stylesheets:
 *  `--tileset-icon`, `--tileset-citizen-width` and `--tileset-citizen-step`.
 */
export const setTilesetSizes = (
  tileset: TilesetDescriptor = currentTileset()
): void => {
  const { style } = document.documentElement,
    { icon, citizen } = tileset.ui;

  style.setProperty('--tileset-icon', `${icon}px`);
  style.setProperty('--tileset-citizen-width', `${citizen.width}px`);
  style.setProperty('--tileset-citizen-step', `${citizen.step}px`);
};

// The torch cursor, once every asset has been imported.
export const setCursor = async (): Promise<void> => {
  const hasAllAssets = await assetStore.hasAllAssets();

  if (hasAllAssets) {
    const cursor = await assetStore.shownAtURL(
      spriteKey(currentTileset(), 'cursor/torch'),
      currentTileset().ui.cursor
    );

    document.body.style.cursor = `url('${cursor}'), default`;
  }
};
