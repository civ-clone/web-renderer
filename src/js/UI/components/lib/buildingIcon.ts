import { assetStore } from '../../AssetStore';
import currentTileset from '../../lib/tilesets';
import { s } from '@dom111/element';
import { spriteKey } from '../../tilesets/TilesetDescriptor';

// The city screen's picture of an improvement or a Wonder (#64), cut from SP299.PIC. It's optional: where the player
//  hasn't imported it, or the tileset has none, nothing is drawn, and the name beside it says it all.

/** How wide the icon is shown: Civ1's are 18 pixels, so twice that. */
export const BUILDING_ICON_WIDTH = 36;

/** An improvement's or a Wonder's sprite: the engine's name, lower-cased, as a unit's is. */
export const buildingSprite = (_: string, wonder: boolean): string =>
  `${wonder ? 'wonders' : 'city-improvements'}/${_.toLowerCase()}`;

/** The icon for an improvement or a Wonder, drawn once its picture has loaded, if there is one. Decorative. */
export const buildingIcon = (_: string, wonder: boolean): HTMLElement => {
  const icon = s('<span class="building-icon" aria-hidden="true"></span>'),
    key = spriteKey(currentTileset(), buildingSprite(_, wonder)),
    cached = assetStore.cachedURL(key, BUILDING_ICON_WIDTH);

  // Shown before: drawn at once, so the row doesn't lay out without it first on every render.
  if (cached !== null) {
    icon.append(s(`<img src="${cached}" alt="">`));

    return icon;
  }

  assetStore
    .has(key)
    .then((has) =>
      has ? assetStore.shownAtURL(key, BUILDING_ICON_WIDTH) : null
    )
    .then((url) => {
      if (url !== null) {
        icon.append(s(`<img src="${url}" alt="">`));
      }
    })
    // Not there after all: the name says it all.
    .catch(() => {});

  return icon;
};

export default buildingIcon;
