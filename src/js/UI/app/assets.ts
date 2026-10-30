import { assetStore } from '../AssetStore';
import currentTileset from '../lib/tilesets';
import { TilesetDescriptor, spriteKey } from '../tilesets/TilesetDescriptor';
import { h } from '../lib/html';
import { s } from '@dom111/element';

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
    const scaledCursor = await assetStore.getShownAt(
      spriteKey(currentTileset(), 'cursor/torch'),
      currentTileset().ui.cursor
    );

    document.body.style.cursor = `url('${scaledCursor.toDataURL(
      'image/png'
    )}'), default`;
  }
};

// preloaded the images as they could be remote
export const preloadAssets = (preloadContainer: HTMLElement): void => {
  assetStore.getAll().then((records) =>
    records.forEach((record) =>
      preloadContainer.append(
        h(
          s<HTMLImageElement>(
            `<img src="${record.uri}" data-path="${record.name}">`
          ),
          {
            error: () =>
              console.error(
                `There was a problem preloading '${record.name}', you may have some missing details.`
              ),
          }
        )
      )
    )
  );
};
