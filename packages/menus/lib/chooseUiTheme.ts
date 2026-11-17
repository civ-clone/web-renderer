import { applyUiTheme, uiThemeArt } from '@civ-clone/ui-widgets/lib/theme';
import { TilesetDescriptor } from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';
import forgetVisitParam from '@civ-clone/ui-platform/lib/forgetVisitParam';
import { interfaceArt } from '@civ-clone/ui-assets/lib/interfaceArt';
import { instance as options } from '@civ-clone/ui-platform/GameOptionsRegistry';

// Choosing the interface's theme (#735), as Options' Theme and the library's Use (#1063) both do it.

/** The class of a select that shows the theme in use, such as Options' Theme: kept to the theme chosen elsewhere. */
export const THEME_CHOICE = 'ui-theme-choice';

/**
 * Whether the theme `id` draws with other interface art than `art`, the page's (#1063): whether the first set it draws
 *  with that is there (`interfaceArt`) is another, not whether its list is.
 */
export const themeChangesArt = (
  id: string,
  art: TilesetDescriptor = interfaceArt()
): boolean => interfaceArt(uiThemeArt(id)).id !== art.id;

/** Where the theme is chosen: during a game or not, and how the page is loaded again for new art. */
export interface ThemeChoice {
  inGame?: boolean;
  reload?: () => void;
}

/**
 * Uses the theme `id`, and keeps it as the `uiTheme` option. Also drops the visit's `?theme=`, which would outrank it
 *  next load, and shows it in any theme select still open (`THEME_CHOICE`). A theme drawing with other interface art
 *  than the page's needs a new page, as windows already open have drawn their icons (#1063): before a game the page
 *  loads at once, as after an import, and during a game its colours apply at once and its art waits for the next load,
 *  as reloading would lose the game. Resolves with whether its art waits so, for a hint to say.
 */
export const chooseUiTheme = (
  id: string,
  { inGame = false, reload = () => window.location.reload() }: ThemeChoice = {}
): boolean => {
  const changesArt = themeChangesArt(id);

  options.set('uiTheme', id);
  applyUiTheme(id);
  forgetVisitParam('theme');

  document
    .querySelectorAll<HTMLSelectElement>(`select.${THEME_CHOICE}`)
    .forEach((select) => {
      select.value = id;
    });

  // Only before a game, when nothing guards leaving the page.
  if (changesArt && !inGame) {
    reload();

    return false;
  }

  return changesArt;
};

export default chooseUiTheme;
