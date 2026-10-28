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
    // As a new game starts, and then every 5 turns (#653): see `AUTOSAVE_CHOICES`.
    autosave: '5',
    // The keys of the sidebar sections the player has collapsed (#697).
    sidebarCollapsed: [],
  });
};

export default setOptionDefaults;
