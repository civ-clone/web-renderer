import { Map } from '../Map';
import { defineSlot } from '@civ-clone/ui-client/lib/interfaceMode';

// The interface's `cityLabels` slot (#824), which each interface in `interfaces/` fills (#825): what names the cities
//  on the map. Its labels take clicks and hovers as any layer does, through `bannerAt`.
export interface CityLabels {
  // The layer that draws them, one of the map's.
  layer: typeof Map;
  // Whether they're drawn with the theme's tokens and the fonts loaded, and so are drawn again when those change.
  followTheme: boolean;
  // Whether they're wide enough to cover a row of the yields, and so give way to them.
  giveWayToYields: boolean;
}

export const cityLabels = defineSlot<CityLabels>('cityLabels');

export default cityLabels;
