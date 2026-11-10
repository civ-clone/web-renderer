import type { WindowSettings } from './Window';
import { defineSlot } from '@civ-clone/ui-platform/lib/interfaceMode';

// The interface's `windowChrome` slot (#860): what a window looks like around its body, and what that brings with it,
//  its keys and where focus goes as it closes. Each window has a chrome of its own, made as the window is, so it can
//  keep what it needs between building and closing.

/** The window a chrome dresses: what it may read, and the parts every chrome builds from. */
export interface WindowChromeHost {
  element(): HTMLDialogElement;
  settings(): Readonly<WindowSettings>;
  /** The title, as HTML. */
  title(): string;
  /** The window's body in its `.body` wrapper, the part that scrolls, made afresh. */
  body(): HTMLElement;
  /** The title bar's buttons, maximise and close, where the window can. */
  headerActions(): HTMLElement[];
  /** Makes `header` the bar that drags the window, and maximises it when double-clicked. */
  draggable(header: HTMLElement): HTMLElement;
  close(): void;
}

export interface WindowChrome {
  /** As the window is made, before its size and classes. */
  attach(): void;
  /** Before the window is emptied, to be built again. */
  building(): void;
  /** Fills the emptied window. */
  build(): void;
  /** After the body is replaced. */
  updated(): void;
  /** Before the window is shown. */
  opening(): void;
  /** Before the window is closed and taken off the page. */
  closing(): void;
  /** After it's closed: true where the chrome has put focus somewhere, false to leave it to the window. */
  closed(): boolean;
}

export const windowChrome =
  defineSlot<(host: WindowChromeHost) => WindowChrome>('windowChrome');

export default windowChrome;
