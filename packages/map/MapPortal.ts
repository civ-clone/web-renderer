// The map as the rest of the game holds it (docs/3d-renderer.md §2.1): the HUD, the reports, the unit panel, the city
//  list, the game menu, the cheats, the city openers and the city screen. Whichever map the game shows answers it: the
//  2D map's portal (`Portal`), or the 3D view.
//
// What only the 2D map has (its layers, its canvas, building tiles into it) isn't here: the 2D view keeps those, and
//  what the game itself asks of its map is `MapRenderer`'s.

import {
  City as CityData,
  Coordinate,
  Unit,
} from '@civ-clone/ui-protocol/types';
import { Size } from './lib/projection';
import Transport from '@civ-clone/ui-client/Transport';

/** How a city opens from the map: which do, and opening one (`lib/cityOpeners.ts` has the game's). */
export type CityOpener = {
  // Whether `city` is one that opens: the map's click moves on to the square's units otherwise.
  opens(city: CityData, portal: MapPortal): boolean;
  open(city: CityData, portal: MapPortal): void;
};

/** What others hear from the map, or tell it. */
export type MapPortalEvents = {
  // A unit chosen to act: on the map, or in a city screen's units (`activate-unit` is emitted on the game's portal).
  ['activate-unit']: [Unit];
  // A square clicked, by its co-ordinates (the cheats listen).
  ['tile-clicked']: [number, number];
};

/**
 * The map, as the rest of the game holds it. Its events are only `MapPortalEvents`: the 2D portal has others of its own,
 *  which a 3D view needn't raise.
 */
export interface MapPortal {
  /** The square in the middle of the view. */
  center(): Coordinate;
  emit<K extends keyof MapPortalEvents>(
    event: K,
    ...args: MapPortalEvents[K]
  ): void;
  /** Whether the square is in view, `margin` squares in from the edges, and not under what floats over the map. */
  isVisible(x: number, y: number, margin?: number): boolean;
  /** Whether the view stops at the top and bottom rows rather than wrapping over the poles. */
  lockVerticalEdges(): boolean;
  /** The map art's tile, across and down, before the scale: the city screen sizes its map from it. */
  nativeTileSize(): Size;
  off<K extends keyof MapPortalEvents>(
    event: K,
    handler: (...args: MapPortalEvents[K]) => void
  ): void;
  on<K extends keyof MapPortalEvents>(
    event: K,
    handler: (...args: MapPortalEvents[K]) => void
  ): void;
  once<K extends keyof MapPortalEvents>(
    event: K,
    handler: (...args: MapPortalEvents[K]) => void
  ): void;
  /** Opens `city`'s screen if it's one that opens from here, and says whether it did. */
  openCity(city: CityData): boolean;
  /** The player whose map this is, or none for a watcher's. */
  playerId(): string | null;
  /** Draws what has changed. */
  render(): void;
  /** The whole scale the map art is drawn at. */
  scale(): number;
  /** Moves the view to have the square in the middle. */
  setCenter(x: number, y: number): void;
  setLockVerticalEdges(lock: boolean): void;
  setZoom(zoom: number, anchor?: Coordinate): void;
  transport(): Transport;
  /** The zoom the map is shown at, which may be between whole scales. */
  zoom(): number;
}

export default MapPortal;
