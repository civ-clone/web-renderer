import { TilesetDescriptor, spriteKey } from '../tilesets/TilesetDescriptor';
import {
  hiddenGrids,
  installedTilesets,
  interfaceTileset,
  onTilesetsInstalled,
} from './tilesets';

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
//  theme, or one with no list), the first installed set that has some, such as the pixel art with nothing imported,
//  but not one for a grid new games don't offer yet (`hiddenGrids`: the hexagonal pixel art without `?hex=1`), whose
//  sheet would be fetched for nothing; or Civ1's, which isn't installed either then.
const resolve = (art: readonly string[]): TilesetDescriptor => {
  const installed = installedTilesets(),
    hidden = hiddenGrids();

  for (const id of art) {
    const tileset = installed.find((tileset) => tileset.id === id);

    if (tileset !== undefined && hasInterfaceArt(tileset)) {
      return tileset;
    }
  }

  return (
    installed.find(
      (tileset) => hasInterfaceArt(tileset) && !hidden.includes(tileset.grid)
    ) ?? interfaceTileset()
  );
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

/** Where `tileset` keeps the interface's sprite `name` (`spriteKey`), by its own name for it (`interfaceSpriteName`). */
export const interfaceSpriteKey = (
  name: string,
  tileset: TilesetDescriptor = interfaceArt()
): string => spriteKey(tileset, interfaceSpriteName(name, tileset));

export default interfaceArt;
