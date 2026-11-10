import Transport from '@civ-clone/ui-client/Transport';
import { defineSlot } from '@civ-clone/ui-platform/lib/interfaceMode';

// The interface's `titleScreen` slot (#824), which each interface in `interfaces/` fills (#825): the menu the page
//  opens on.
/** The menu the page opens on, made in `element`: removed once a game starts. */
export type TitleScreen = new (element: HTMLElement, transport: Transport) => {
  remove(): void;
};

export const titleScreen = defineSlot<TitleScreen>('titleScreen');

export default titleScreen;
