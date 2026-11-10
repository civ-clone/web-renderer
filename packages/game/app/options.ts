import { defaultInterface } from '@civ-clone/ui-platform/lib/interfaceMode';
import currentTileset from '@civ-clone/ui-assets/lib/tilesets';
import { instance as options } from '@civ-clone/ui-platform/GameOptionsRegistry';

// Any the player has changed come back from browser storage (#343).
export const setOptionDefaults = (): void => {
  options.defaults({
    autoEndOfTurn: true,
    autoEndOfTurnExceptions: ['CivilDisorder'],
    unitEdgeMargin: 2,
    mapScale: currentTileset().defaultScale,
    lockVerticalEdges: false,
    // The new interface's tooltip for the map square under the mouse (#748).
    squareTooltips: true,
    // As a new game starts, and then every 5 turns (#653): see `AUTOSAVE_CHOICES`.
    autosave: '5',
    // The keys of the sidebar sections the player has collapsed (#697).
    sidebarCollapsed: [],
    // The keys of those that start collapsed which the player has opened (#700, #701).
    sidebarExpanded: [],
    // Sent to the game, whose rules act on them (#690, #691): see `sendBuildPreferences`.
    keepBuildingMilitaryUnits: false,
    newCitiesBuildDefender: false,
    // Light, dark or the system's (#706): see `COLOUR_SCHEMES`.
    colourScheme: 'system',
    // Which interface (#735): see `interfaces()`.
    interface: defaultInterface(),
    // Which theme the interface is drawn in (#735), or nothing for the one it comes with (#824): see `uiThemes()`.
    uiTheme: '',
    // How the unit awaiting orders is marked (#753): the theme's, or the blink, the ring or both. See `UNIT_MARKER_CHOICES`.
    unitMarker: 'theme',
    // Civilization's music, with an ASOUND.CVL imported (#126): on, and its volume, 0 to 100. See `soundGain`.
    sound: true,
    soundVolume: 70,
  });
};

export default setOptionDefaults;
