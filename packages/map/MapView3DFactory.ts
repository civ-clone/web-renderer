// How the page makes a 3D map (docs/3d-renderer.md §2.4): the 3D view is a script of its own, `dist/map3d.js`, fetched
//  the first time a game starts in 3D, so a player who keeps the 2D map never downloads three.js. Loaded, it puts its
//  factory on the page under `MAP3D_GLOBAL`.
//
// Everything with state (the world, the transport, the options it reads, the 2D art's sizes) comes in through
//  `MapView3DDeps`, made by the page's own bundle: the 3D script imports nothing that has state of its own, so no
//  registry or singleton is bundled twice.

import { City, Tile, Unit } from '@civ-clone/ui-protocol/types';
import { CityOpener, MapPortal } from './MapPortal';
import MapRenderer from './MapRenderer';
import { Size } from './lib/projection';
import Transport from '@civ-clone/ui-client/Transport';
import World from './components/World';

/** Where the 3D script puts what it makes: `window.civMap3D`. */
export const MAP3D_GLOBAL = 'civMap3D';

/**
 * What a square of the map does when clicked, held or right-clicked, and the window that asks for one: the page's own
 *  (`@civ-clone/ui-game/lib/mapSquares`), so both maps open the same cities, units and menus.
 */
export type MapSquares = {
  // A click on `tile`, held by `portal`.
  click(portal: MapPortal, tile: Tile): void;
  // The window saying what a square is being chosen for: `closed` is told when it closes, however it does.
  prompt(prompt: string, closed: () => void): { close(): void };
  // The active unit's menu at (`x`, `y`) on the page, for `tile`: `pressed` for a press held, rather than a right-click.
  menu(
    launcher: object,
    x: number,
    y: number,
    unit: Unit,
    tile: Tile,
    transport: Transport,
    pressed: boolean
  ): void;
  // Whether a right-click opens the unit's menu, and whether a menu is open over the map.
  menuOnRightClick(): boolean;
  menuOpen(): boolean;
  // The tooltip for `tile`, or its city, over `box` on the page, where the interface shows one: whether it opened.
  tooltip(
    over: HTMLElement,
    tile: Tile,
    playerId: string,
    box: { left: number; top: number; bottom: number }
  ): boolean;
  // Closes the tooltip open over `over`, if one is.
  endTooltip(over: HTMLElement): void;
};

export type MapView3DDeps = {
  // A unit picked on the map, or in a city screen's units (the portal's `activate-unit`).
  activateUnit: (unit: Unit) => void;
  // The 2D map art, read when asked, which the city screen still draws its map with (§2.1): which set it is, which
  //  changes when the player chooses other art mid-game (#1118), and its sizes.
  art: {
    id(): string;
    nativeTileSize(): Size;
    scale(): number;
    zoom(): number;
  };
  // The camera's distance, kept as the 2D map's zoom is: what the player last chose, or nothing for the default.
  cameraDistance: {
    get(): number | null;
    set(distance: number): void;
  };
  // A city's name as the page's other maps and windows give it (the locale's, by its founder), or its own name.
  cityName?: (city: City) => string;
  // How a city opens from the map (`lib/cityOpeners.ts`): the player's own, or a watcher's.
  cityOpener: CityOpener;
  // What floats over the map (the sidebar's sections, #697).
  coveredBy: HTMLElement[];
  // `?debug=1`: an overlay of what each frame costs (docs/3d-renderer.md §12).
  debug?: boolean;
  // Whether the view stops at the top and bottom rows rather than wrapping over the poles.
  lockVerticalEdges: boolean;
  // The canvas the map is drawn on, sized to its parent.
  mapCanvas: HTMLCanvasElement;
  // The minimap's canvas, which the 3D map draws an overview of its own on, or nothing where there's none.
  minimapCanvas: HTMLCanvasElement | null;
  playerId: string;
  // What a square does when clicked, held or right-clicked.
  squares: MapSquares;
  transport: Transport;
  // How big units are drawn, as the player chose it (1 is life size), and what tells of a change, returning what stops
  //  it. Life size where there's none.
  unitSize?: {
    get(): number;
    onChange(changed: () => void): () => void;
  };
  // The letter for what a busy unit is doing, as the 2D map writes it over the unit (the locale's), or nothing.
  unitStatus?: (unit: Unit) => string | null;
  // The player's world, made by the page, which tile patches are written to.
  world: World;
};

export type CreateMapView3D = (deps: MapView3DDeps) => MapRenderer;

/** What `dist/map3d.js` puts on the page. */
export type Map3DScript = {
  createMapView3D: CreateMapView3D;
};
