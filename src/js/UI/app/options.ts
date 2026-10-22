import currentTileset from '../lib/tilesets';
import { instance as options } from '../GameOptionsRegistry';

// Any the player has changed come back from browser storage (#343).
export const setOptionDefaults = (): void => {
  options.defaults({
    autoEndOfTurn: true,
    autoEndOfTurnExceptions: ['CivilDisorder'],
    unitEdgeMargin: 2,
    mapScale: currentTileset().defaultScale,
    lockVerticalEdges: false,
  });
};

export default setOptionDefaults;
