import { defaultInterface } from '@civ-clone/ui-platform/lib/interfaceMode';
import {
  bundledTilesets,
  defaultZoom,
  mapTilesetOption,
  zoomOption,
  zoomOptionFromMapScale,
} from '@civ-clone/ui-assets/lib/tilesets';
import { instance as options } from '@civ-clone/ui-platform/GameOptionsRegistry';

// Any the player has changed come back from browser storage (#343).
export const setOptionDefaults = (): void => {
  // The map scale a player chose is their zoom now (#1063): `mapScale` Civ1's, `mapScale.<id>` another set's.
  options.rename(zoomOptionFromMapScale);

  options.defaults({
    autoEndOfTurn: true,
    autoEndOfTurnExceptions: ['CivilDisorder'],
    unitEdgeMargin: 2,
    // Each set's own zoom (#97, #1063): Civ1's `zoom.civ1`, Civ2's `zoom.civ2`, the pixel art's `zoom.civ1-pixelart`,
    //  so a zoom chosen for any of them comes back.
    ...Object.fromEntries(
      bundledTilesets().map((tileset) => [
        zoomOption(tileset),
        defaultZoom(tileset),
      ])
    ),
    // The art the player chose for each grid's maps (#1063), a set's id, or nothing until they choose: then the map is
    //  drawn with the set imported for its grid, or the one that ships with civ.one (`mapTileset`).
    ...Object.fromEntries(
      [...new Set(bundledTilesets().map(({ grid }) => grid))].map((grid) => [
        mapTilesetOption(grid),
        '',
      ])
    ),
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
    // The 3D map's camera's distance, as the player last chose it, or 0 for the camera's own (docs/3d-renderer.md §11).
    //  See `MAP3D_DISTANCE_OPTION`.
    map3dDistance: 0,
    // How big the 3D map draws its units: life size, unless the player chose otherwise. See `MAP3D_UNIT_SIZE_OPTION`.
    map3dUnitSize: 1,
    // How the 3D map's units move, and whether other players' are shown moving. See `MAP3D_WALKS_OPTION`.
    map3dWalks: 'normal',
    map3dRivalsWalk: true,
    // Civilization's music, with an ASOUND.CVL imported (#126): on, and its volume, 0 to 100. See `soundGain`.
    sound: true,
    soundVolume: 70,
  });
};

export default setOptionDefaults;
