// The interface's look, set on `<html>` for the stylesheet's tokens to follow: which theme (#736) and whether it is
//  light or dark (#706). Changing either restyles everything at once, with no reload.

// Civ1 classic is the default and needs no attribute; the others are named by `data-ui-theme`. #167's manifests
//  replace this list, and add to the choice Options offers.
export const UI_THEMES = ['civ1-classic', 'slate'];

export const DEFAULT_UI_THEME = 'civ1-classic';

// `system` follows the browser or OS, and keeps following it as it changes.
export const COLOUR_SCHEMES = ['system', 'light', 'dark'];

/** The theme to use: the visit's `?theme=` when it names one, or else the `uiTheme` option. */
export const uiThemeFrom = (param: string | null, option: unknown): string =>
  [param, option].find(
    (name): name is string =>
      typeof name === 'string' && UI_THEMES.includes(name)
  ) ?? DEFAULT_UI_THEME;

/** The theme in use. */
export const currentUiTheme = (
  root: HTMLElement = document.documentElement
): string => root.getAttribute('data-ui-theme') ?? DEFAULT_UI_THEME;

// Sets the theme, which restyles everything at once. A name that isn't a theme is ignored.
export const applyUiTheme = (
  name: string | null,
  root: HTMLElement = document.documentElement
): void => {
  if (name === null || !UI_THEMES.includes(name)) {
    return;
  }

  if (name === DEFAULT_UI_THEME) {
    root.removeAttribute('data-ui-theme');

    return;
  }

  root.setAttribute('data-ui-theme', name);
};

// The player's choice of light or dark (the `colourScheme` option); anything but `light` or `dark` follows the system.
export const applyColourScheme = (
  scheme: string,
  root: HTMLElement = document.documentElement
): void => {
  if (scheme === 'light' || scheme === 'dark') {
    root.setAttribute('data-theme', scheme);

    return;
  }

  root.removeAttribute('data-theme');
};
