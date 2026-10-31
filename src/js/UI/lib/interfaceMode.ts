// Which interface is in use (#735): the classic one, or the new one being built behind this flag until the switch-over.
//  The `interface` option says, kept like the others; `?interface=new` (or `classic`) says for one visit. Read where a
//  family of components is put together, never inside a component, with one exception: `Window`, which every window
//  shares, picks its chrome from it (#738).

export const INTERFACES = ['classic', 'new'] as const;

export type InterfaceMode = (typeof INTERFACES)[number];

let mode: InterfaceMode = 'classic';

const isInterface = (value: unknown): value is InterfaceMode =>
  (INTERFACES as readonly unknown[]).includes(value);

/** The interface in use. */
export const interfaceMode = (): InterfaceMode => mode;

/**
 * Sets the interface from the visit's `?interface=` when it names one, or else the `interface` option, and says which
 *  on `<html>` as `data-interface`. Anything else is ignored.
 */
export const applyInterface = (
  param: string | null,
  option: unknown,
  root: HTMLElement = document.documentElement
): InterfaceMode => {
  mode = isInterface(param) ? param : isInterface(option) ? option : 'classic';

  root.setAttribute('data-interface', mode);

  return mode;
};

export default interfaceMode;
