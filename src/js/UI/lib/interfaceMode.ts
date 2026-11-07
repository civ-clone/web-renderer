// Which interface is in use (#735): the new one, or the classic one, kept for one release after the switch-over.
//  The `interface` option says, kept like the others; `?interface=classic` (or `new`) says for one visit. Read where a
//  family of components is put together, never inside a component, with one exception: `Window`, which every window
//  shares, picks its chrome from it (#738).

export const INTERFACES = ['new', 'classic'] as const;

export type InterfaceMode = (typeof INTERFACES)[number];

export const DEFAULT_INTERFACE: InterfaceMode = 'new';

let mode: InterfaceMode = DEFAULT_INTERFACE,
  // What the player last chose, which differs from `mode` until the page next loads: the interface can't change under
  //  a game in play.
  chosen: InterfaceMode = mode;

const isInterface = (value: unknown): value is InterfaceMode =>
  (INTERFACES as readonly unknown[]).includes(value);

/** The interface in use. */
export const interfaceMode = (): InterfaceMode => mode;

/** The interface the next page load will use. */
export const chosenInterface = (): InterfaceMode => chosen;

/** Remembers the player's choice, for `chosenInterface`. The `interface` option is what keeps it. */
export const chooseInterface = (choice: InterfaceMode): void => {
  chosen = choice;
};

/**
 * Sets the interface from the visit's `?interface=` when it names one, or else the `interface` option, and says which
 *  on `<html>` as `data-interface`. Anything else is ignored.
 */
export const applyInterface = (
  param: string | null,
  option: unknown,
  root: HTMLElement = document.documentElement
): InterfaceMode => {
  mode = isInterface(param)
    ? param
    : isInterface(option)
    ? option
    : DEFAULT_INTERFACE;
  chosen = mode;

  root.setAttribute('data-interface', mode);

  return mode;
};

export default interfaceMode;
