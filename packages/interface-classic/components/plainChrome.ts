import {
  WindowChrome,
  WindowChromeHost,
} from '@civ-clone/ui-component-window/windowChrome';
import { s } from '@dom111/element';

// The classic interface's window chrome (#860): a title bar over the body, and nothing more.
export const plainChrome = (host: WindowChromeHost): WindowChrome => ({
  attach: () => {},
  building: () => {},
  build: () => {
    const headerActions = host.headerActions();

    host
      .element()
      .append(
        host.draggable(
          s(`<header><h3>${host.title()}</h3></header>`, ...headerActions)
        ),
        host.body()
      );
  },
  updated: () => {},
  opening: () => {},
  closing: () => {},
  closed: () => false,
});

export default plainChrome;
