// The interface's look, set on `<html>` for the stylesheet's tokens to follow: which theme (#736). Changing it restyles
//  everything at once, with no reload.

// Civ1 classic is the default and needs no attribute; the others are named by `data-ui-theme`. #167's manifests
//  replace this list.
export const UI_THEMES = ['civ1-classic', 'slate'];

export const DEFAULT_UI_THEME = 'civ1-classic';

// The theme named by `?theme=`, for this visit only until #167's picker. A name that isn't a theme is ignored.
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
