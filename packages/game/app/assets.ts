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

// The torch cursor, from the interface's art (#1063): Civilization's when it's imported, and otherwise civ.one's own.
//  The browser's own while that's missing, rather than a cursor that can't be seen.
export const setCursor = async (
  tileset: TilesetDescriptor = interfaceArt()
): Promise<void> => {
  const key = interfaceSpriteKey('cursor/torch', tileset);

  if (await assetStore.has(key)) {
    const cursor = await assetStore.shownAtURL(key, tileset.ui.cursor);

    document.body.style.cursor = `url('${cursor}'), default`;
  }
};
