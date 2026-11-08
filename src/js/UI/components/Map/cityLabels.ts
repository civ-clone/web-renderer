import CityNames from './CityNames';
import { defineSlot } from '../../lib/interfaceMode';

// The interface's `cityLabels` slot (#824), which each interface in `interfaces/` fills (#825): what names the cities
//  on the map.
export const cityLabels = defineSlot<typeof CityNames>('cityLabels');

export default cityLabels;
