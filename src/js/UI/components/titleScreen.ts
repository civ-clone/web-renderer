import MainMenu from './MainMenu';
import TitleMenu from './TitleMenu';
import { defineSlot } from '../lib/interfaceMode';

// The interface's `titleScreen` slot (#824), which each interface in `interfaces/` fills (#825): the menu the page
//  opens on.
export const titleScreen = defineSlot<typeof TitleMenu | typeof MainMenu>(
  'titleScreen'
);

export default titleScreen;
