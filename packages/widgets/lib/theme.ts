// The interface's look, set on `<html>` for the stylesheet's tokens to follow: which theme (#736) and whether it is
//  light or dark (#706). Changing either restyles everything at once, with no reload.

// A theme is registered by the interface that brings it (#861), with its tokens in that interface's `styles/`. The
//  default needs no attribute, as the stylesheet draws it on `:root`; the others are named by `data-ui-theme`. #167's
//  manifests will say more about each.
export interface UiTheme {
  id: string;
  // The translation key of the name Options shows.
  name: string;
  // Whether it's the one the stylesheet draws on `:root` with no `data-ui-theme`: there's one, and it's what is used
  //  when nothing names another.
  default?: boolean;
}

const themes = new Map<string, UiTheme>();

/** Makes a theme available, replacing any with the same `id`. Options lists them in the order they're registered. */
export const registerTheme = (theme: UiTheme): void => {
  themes.set(theme.id, { ...theme });
};

/** The themes to choose from. */
export const uiThemes = (): UiTheme[] => [...themes.values()];

/** The theme the stylesheet draws with no `data-ui-theme`, once the interface that brings it has registered it. */
export const defaultUiTheme = (): string =>
  uiThemes().find((theme) => theme.default)?.id ?? '';

const isUiTheme = (name: unknown): name is string =>
  typeof name === 'string' && themes.has(name);

// `system` follows the browser or OS, and keeps following it as it changes.
export const COLOUR_SCHEMES = ['system', 'light', 'dark'];

/** The theme to use: the visit's `?theme=` when it names one, or else the `uiTheme` option, or else the interface's. */
export const uiThemeFrom = (
  param: string | null,
  option: unknown,
  interfaceTheme: string = defaultUiTheme()
): string =>
  [param, option, interfaceTheme].find(isUiTheme) ?? defaultUiTheme();

/** The theme in use. */
export const currentUiTheme = (
  root: HTMLElement = document.documentElement
): string => root.getAttribute('data-ui-theme') ?? defaultUiTheme();

// Sets the theme, which restyles everything at once. A name that isn't a theme is ignored.
export const applyUiTheme = (
  name: string | null,
  root: HTMLElement = document.documentElement
): void => {
  if (!isUiTheme(name)) {
    return;
  }

  if (name === defaultUiTheme()) {
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
