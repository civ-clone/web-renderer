// The 3D map as the rest of the game holds it (`MapPortal`, docs/3d-renderer.md §2.1): the HUD, the reports, the menus
//  and the city screens.
//
// For now it keeps the square the camera looks at, and opens cities; the camera itself follows in slice 1.2. The city
//  screen still draws its map with the 2D art, so the sizes it reads (`nativeTileSize`, `scale`, `zoom`) are that art's,
//  as the page's bundle reads them (`MapView3DDeps['art']`).

import { City as CityData, Coordinate } from '@civ-clone/ui-protocol/types';
import { EventEmitter } from '@dom111/typed-event-emitter';
import { MapPortal, MapPortalEvents } from '@civ-clone/ui-map/MapPortal';
import { MapView3DDeps } from '@civ-clone/ui-map/MapView3DFactory';
import { Size } from '@civ-clone/ui-map/lib/projection';
import Transport from '@civ-clone/ui-client/Transport';

export type MapPortal3DDeps = Pick<
  MapView3DDeps,
  'art' | 'cityOpener' | 'lockVerticalEdges' | 'playerId' | 'transport'
>;

export class MapPortal3D
  extends EventEmitter<MapPortalEvents>
  implements MapPortal
{
  #center: Coordinate = { x: 0, y: 0 };
  #deps: MapPortal3DDeps;
  #lockVerticalEdges: boolean;
  // The view has changed and is drawn again: the view's own.
  #changed: () => void;

  constructor(deps: MapPortal3DDeps, changed: () => void) {
    super();

    this.#deps = deps;
    this.#lockVerticalEdges = deps.lockVerticalEdges;
    this.#changed = changed;
  }

  center(): Coordinate {
    return { ...this.#center };
  }

  /** Every square is in view until the camera is (slice 1.2): nothing is brought into view for being out of it. */
  isVisible(): boolean {
    return true;
  }

  lockVerticalEdges(): boolean {
    return this.#lockVerticalEdges;
  }

  nativeTileSize(): Size {
    return this.#deps.art.nativeTileSize();
  }

  /** Opens `city`'s screen if it's one that opens from here, as the 2D portal does, and says whether it did. */
  openCity(city: CityData): boolean {
    const { cityOpener } = this.#deps;

    if (!cityOpener.opens(city, this)) {
      return false;
    }

    cityOpener.open(city, this);

    return true;
  }

  playerId(): string | null {
    return this.#deps.playerId;
  }

  render(): void {
    this.#changed();
  }

  scale(): number {
    return this.#deps.art.scale();
  }

  setCenter(x: number, y: number): void {
    if (this.#center.x === x && this.#center.y === y) {
      return;
    }

    this.#center = { x, y };
    this.#changed();
  }

  setLockVerticalEdges(lock: boolean): void {
    this.#lockVerticalEdges = lock;
  }

  /**
   * The 2D art's zoom, which Options sets and keeps for the city screen before it calls this: the 3D camera's own
   *  distance is an option of its own (slice 1.2).
   */
  setZoom(): void {}

  transport(): Transport {
    return this.#deps.transport;
  }

  zoom(): number {
    return this.#deps.art.zoom();
  }
}

export default MapPortal3D;
