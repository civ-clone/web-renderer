import { s } from '@dom111/element';

// The button system's variants (#740): `primary` for the one action a window is for, `secondary` for the others,
//  `quiet` for Cancel and the like, `danger` for what can't be undone (Sell, Delete), `icon` for a glyph alone. `bare` is a
//  button its own component draws.
export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'quiet'
  | 'danger'
  | 'icon'
  | 'bare';

export interface ButtonOptions {
  variant?: ButtonVariant;
  // The key that does the same, by its `KeyboardEvent.key` name: shown after the label where the theme shows it
  //  ("Cancel Esc"), and given to assistive technology as the button's shortcut rather than as part of its name.
  hotkey?: string | null;
  title?: string | null;
  className?: string | null;
  disabled?: boolean;
}

// How a key is written on its chip, where that isn't its name.
const keyLabels: { [key: string]: string } = {
  Escape: 'Esc',
};

/** A button of the system, with `label` (markup, as the translations give it) and the variant's class. */
export const button = (
  label: string,
  {
    variant = 'secondary',
    hotkey = null,
    title = null,
    className = null,
    disabled = false,
  }: ButtonOptions = {}
): HTMLButtonElement => {
  const element = s<HTMLButtonElement>(
    `<button type="button" class="btn-${variant}">${label}</button>`
  );

  if (className !== null) {
    element.classList.add(...className.split(' ').filter((name) => name));
  }

  // Drawn by the stylesheet, so the button's text stays its label.
  if (hotkey !== null) {
    element.dataset.hotkey = keyLabels[hotkey] ?? hotkey;
    element.setAttribute('aria-keyshortcuts', hotkey);
  }

  if (title !== null) {
    element.title = title;
  }

  element.disabled = disabled;

  return element;
};

export default button;
