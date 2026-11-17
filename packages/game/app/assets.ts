import { assetStore } from '@civ-clone/ui-assets/AssetStore';
import interfaceArt, {
  interfaceSpriteKey,
} from '@civ-clone/ui-assets/lib/interfaceArt';
import { TilesetDescriptor } from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';

/**
 * The sizes `tileset` shows its sprites at outside the map (#729), as custom properties on `:root` for the stylesheets:
 *  `--tileset-icon`, `--tileset-citizen-width` and `--tileset-citizen-step`. The interface's art's by default (#1063).
 */
export const setTilesetSizes = (
  tileset: TilesetDescriptor = interfaceArt()
): void => {
  const { style } = document.documentElement,
    { icon, citizen } = tileset.ui;

  style.setProperty('--tileset-icon', `${icon}px`);
  style.setProperty('--tileset-citizen-width', `${citizen.width}px`);
  style.setProperty('--tileset-citizen-step', `${citizen.step}px`);
};

// The torch cursor, from the interface's art (#1063), once every asset has been imported.
export const setCursor = async (): Promise<void> => {
  const hasAllAssets = await assetStore.hasAllAssets();

  if (hasAllAssets) {
    const art = interfaceArt(),
      cursor = await assetStore.shownAtURL(
        interfaceSpriteKey('cursor/torch', art),
        art.ui.cursor
      );

    document.body.style.cursor = `url('${cursor}'), default`;
  }
};
