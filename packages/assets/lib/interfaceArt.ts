import { TilesetDescriptor, spriteKey } from '../tilesets/TilesetDescriptor';
import {
  installedTilesets,
  interfaceTileset,
  isHosted,
  mapTileset,
  onTilesetsInstalled,
  ruleSetMapTileset,
} from './tilesets';
import {
  hasPreloadedImage,
  onPreloadedImagesChanged,
} from './getPreloadedImage';

// The interface's art (#1063): the icons, citizens, meters, cursors and textures every screen draws, and the map draws
//  over its tiles. A theme names the tilesets it draws them with, in order (`UiTheme.art`), and the first one there is
//  is used. The interface asks for each sprite by civ.one's name for it (`interfaceNames`), which a tileset maps to its
//  own (`names.ui`).
//
// Themes are registered by the interfaces, which this package can't import, so whoever applies the theme says which
//  list is the current one (`provideInterfaceArt`), as the page does as it starts (`bootstrap.ts`). The page keeps the
//  list it started with: a theme chosen with other art changes it at the next load (Options' `themeRows`).

// The names it's asked for by, for what lists them.
export type { InterfaceName } from './interfaceNames';
export {
  interfaceNames,
  optionalInterfaceNames,
  requiredInterfaceNames,
} from './interfaceNames';

let preferred: () => readonly string[] = () => [],
  // The set the page settled on, once asked for: resolved again only once the list or the installed sets change, so a
  //  lookup on every draw (`Map#getInterfaceImage`) doesn't resolve it each time.
  settled: TilesetDescriptor | null = null;

const unsettle = (): void => {
  settled = null;
};

onTilesetsInstalled(unsettle);

/** Has `interfaceArt()` follow `art`, the tilesets the theme in use draws its interface art with, in order. */
export const provideInterfaceArt = (art: () => readonly string[]): void => {
  preferred = art;
  unsettle();
};

/** Whether `tileset` has interface art of its own: sprites under `assets.ui` prefixes, as Civ1's has and Civ2's hasn't. */
export const hasInterfaceArt = ({
  assets: { ui },
}: Pick<TilesetDescriptor, 'assets'>): boolean => ui.length > 0;

// The first of `art` that is installed and has interface art; or, for a theme that names none that is (an unknown
//  theme, or one with no list), the first installed set that has some, such as the pixel art with nothing imported;
//  or Civ1's, which isn't installed either then.
const resolve = (art: readonly string[]): TilesetDescriptor => {
  const installed = installedTilesets();

  for (const id of art) {
    const tileset = installed.find((tileset) => tileset.id === id);

    if (tileset !== undefined && hasInterfaceArt(tileset)) {
      return tileset;
    }
  }

  return installed.find(hasInterfaceArt) ?? interfaceTileset();
};

/**
 * The tileset the interface's art comes from: the first of `art` that is installed and has interface art, or the first
 *  installed set with some when none of `art` is, or Civ1's (`interfaceTileset`) when no set is, which isn't installed
 *  either then, so nothing can be played
 *  (`hasInstalledInterfaceArt`). Without `art`, the theme's list as
 *  `provideInterfaceArt` was told it, resolved once and kept until that list or the installed sets change, so the
 *  sizes, the cursor and every sprite come from the same set.
 */
export const interfaceArt = (art?: readonly string[]): TilesetDescriptor =>
  art === undefined ? (settled ??= resolve(preferred())) : resolve(art);

/**
 * Whether the interface's art (`interfaceArt`, of `art` or the theme's list) is there to draw with: installed, rather
 *  than Civ1's named for want of any (#1063). Not on a first visit offline with nothing imported, when the pixel art's
 *  sheet can't be fetched: then nothing can be played, and the menus say why.
 */
export const hasInstalledInterfaceArt = (art?: readonly string[]): boolean => {
  const { id } = interfaceArt(art);

  return installedTilesets().some((tileset) => tileset.id === id);
};

/** `tileset`'s own name for the interface's sprite `name`, which is `name` unless its `names.ui` says otherwise. */
export const interfaceSpriteName = (
  name: string,
  tileset: TilesetDescriptor = interfaceArt()
): string => {
  const names = tileset.names.ui;

  return names !== undefined &&
    Object.prototype.hasOwnProperty.call(names, name)
    ? names[name]!
    : name;
};

// The game's own art for the interface (#1052, #1054, #1165): the art the game's rule set names for its map (Civ2's),
//  when it has no interface art of its own but names some of the interface's sprites as its own (`names.ui`), as
//  Civ2's does with its icons and people. A sprite it names and the player has imported is drawn from it; another,
//  from civ.one's own interface art (the pixel art, a hosted set) where that has it, and otherwise from the theme's
//  (`interfaceArt`). Without such a set, as in every Civ1 game (on Civ2's isometric map too, whose rule set names no
//  art), the theme's art draws every sprite, as before.

/** Whether `tileset` names interface sprites of its own without being interface art, as Civ2's does. */
export const hasOwnInterfaceSprites = (tileset: TilesetDescriptor): boolean =>
  !hasInterfaceArt(tileset) && Object.keys(tileset.names.ui ?? {}).length > 0;

/**
 * The game's own interface art: the set its map is drawn with, when that is the art its rule set names
 *  (`ruleSetMapTileset`, Civ2's) and has interface sprites of its own (`hasOwnInterfaceSprites`), or null.
 */
export const gameInterfaceArt = (): TilesetDescriptor | null => {
  const tileset = mapTileset();

  return ruleSetMapTileset(tileset.grid) === tileset &&
    hasOwnInterfaceSprites(tileset)
    ? tileset
    : null;
};

/**
 * civ.one's own interface art (the pixel art): of the installed hosted sets with interface art, the first the theme
 *  lists, or else the first on the square grid, if one is.
 */
export const ownInterfaceArt = (): TilesetDescriptor | null => {
  const own = installedTilesets().filter(
    (tileset) => isHosted(tileset) && hasInterfaceArt(tileset)
  );

  return (
    preferred()
      .map((id) => own.find((tileset) => tileset.id === id))
      .find((tileset) => tileset !== undefined) ??
    own.find(({ grid }) => grid === 'square') ??
    null
  );
};

/** A sprite of the interface's: the set it's drawn from, and its key there. */
export interface InterfaceSprite {
  tileset: TilesetDescriptor;
  key: string;
}

/**
 * Where the interface's sprite `name` is drawn from: the game's own art (`gameInterfaceArt`) when that names it and it
 *  has been imported; otherwise, in such a game, civ.one's own art (`ownInterfaceArt`) when that has it loaded; and
 *  otherwise the theme's (`interfaceArt`), whether or not it has it.
 */
export const interfaceSprite = (name: string): InterfaceSprite => {
  const theme = interfaceArt(),
    game = gameInterfaceArt();

  if (game !== null) {
    const names = game.names.ui!;

    if (Object.prototype.hasOwnProperty.call(names, name)) {
      const own = names[name]!;

      if (hasPreloadedImage(own, game)) {
        return { tileset: game, key: spriteKey(game, own) };
      }
    }

    const own = ownInterfaceArt();

    if (own !== null && own !== theme) {
      const ownName = interfaceSpriteName(name, own);

      if (hasPreloadedImage(ownName, own)) {
        return { tileset: own, key: spriteKey(own, ownName) };
      }
    }
  }

  return { tileset: theme, key: interfaceSpriteKey(name, theme) };
};

// What's drawn with the interface's art, to draw again as the sprites change (`followInterfaceArt`), each held weakly so
//  an element that's gone is let go.
const followers = new Set<{ element: WeakRef<Element>; refresh: () => void }>();

onPreloadedImagesChanged(() =>
  followers.forEach((follower) => {
    if (follower.element.deref() === undefined) {
      followers.delete(follower);

      return;
    }

    follower.refresh();
  })
);

/**
 * Runs `refresh` whenever the sprites drawn from change, for as long as `element` is around: as a sheet a sprite falls
 *  back to arrives in a Civ2 game (the pixel art, `startFallbackInterfaceArt`), or an import adds the game's own, so a
 *  picture already drawn takes the sprite `interfaceSprite` now says. `refresh` resolves its sprites again, and draws
 *  only the ones that changed.
 */
export const followInterfaceArt = (
  element: Element,
  refresh: () => void
): void => {
  followers.add({ element: new WeakRef(element), refresh });
};

/**
 * Where `tileset` keeps the interface's sprite `name` (`spriteKey`), by its own name for it (`interfaceSpriteName`).
 *  Without `tileset`, where it's drawn from in the game being played (`interfaceSprite`).
 */
export const interfaceSpriteKey = (
  name: string,
  tileset?: TilesetDescriptor
): string =>
  tileset === undefined
    ? interfaceSprite(name).key
    : spriteKey(tileset, interfaceSpriteName(name, tileset));

export default interfaceArt;
