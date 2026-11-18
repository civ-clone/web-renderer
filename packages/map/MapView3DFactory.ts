// How the page makes a 3D map (docs/3d-renderer.md §2.4): the 3D view is a script of its own, `dist/map3d.js`, fetched
//  the first time a game starts in 3D, so a player who keeps the 2D map never downloads three.js. Loaded, it puts its
//  factory on the page under `MAP3D_GLOBAL`.
//
// Everything with state (the world, the transport, the options, the art's sizes) comes in through `MapView3DDeps`,
//  made by the page's own bundle: the 3D script imports nothing that has state of its own, so no registry or singleton
//  is bundled twice.

import { Unit } from '@civ-clone/ui-protocol/types';
import { CityOpener } from './MapPortal';
import MapRenderer from './MapRenderer';
import { Size } from './lib/projection';
import Transport from '@civ-clone/ui-client/Transport';
import World from './components/World';

/** Where the 3D script puts what it makes: `window.civMap3D`. */
export const MAP3D_GLOBAL = 'civMap3D';

export type MapView3DDeps = {
  // A unit picked on the map, or in a city screen's units (the portal's `activate-unit`).
  activateUnit: (unit: Unit) => void;
  // The 2D map art's sizes, read when asked, which the city screen still draws its map with (§2.1).
  art: {
    nativeTileSize(): Size;
    scale(): number;
    zoom(): number;
  };
  // How a city opens from the map (`lib/cityOpeners.ts`): the player's own, or a watcher's.
  cityOpener: CityOpener;
  // What floats over the map (the sidebar's sections, #697).
  coveredBy: HTMLElement[];
  // Whether the view stops at the top and bottom rows rather than wrapping over the poles.
  lockVerticalEdges: boolean;
  // The canvas the map is drawn on, sized to its parent.
  mapCanvas: HTMLCanvasElement;
  playerId: string;
  transport: Transport;
  // The player's world, made by the page, which tile patches are written to.
  world: World;
};

export type CreateMapView3D = (deps: MapView3DDeps) => MapRenderer;

/** What `dist/map3d.js` puts on the page. */
export type Map3DScript = {
  createMapView3D: CreateMapView3D;
};
