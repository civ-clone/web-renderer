// The 3D map as the rest of the game holds it (`MapPortal`, docs/3d-renderer.md §2.1): the HUD, the reports, the menus
//  and the city screens.
//
// Its centre is the square the view's camera looks at, and centring it glides the camera there; it opens cities. The
//  city screen still draws its map with the 2D art, so the sizes it reads (`nativeTileSize`, `scale`, `zoom`) are that
//  art's, as the page's bundle reads them (`MapView3DDeps['art']`).

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

/** What the portal asks of the view's camera. */
export type MapPortal3DCamera = {
  // The square it looks at.
  centre(): Coordinate;
  // Look at the square at (`x`, `y`).
  centreOn(x: number, y: number): void;
  // Something has changed: draw again.
  changed(): void;
  // Whether the square at (`x`, `y`) is on the screen, `margin` squares in from its edges, and not under what floats
  //  over the map.
  visible(x: number, y: number, margin: number): boolean;
};

export class MapPortal3D
  extends EventEmitter<MapPortalEvents>
  implements MapPortal
{
  #camera: MapPortal3DCamera;
  #deps: MapPortal3DDeps;
  #lockVerticalEdges: boolean;

  constructor(deps: MapPortal3DDeps, camera: MapPortal3DCamera) {
    super();

    this.#deps = deps;
    this.#lockVerticalEdges = deps.lockVerticalEdges;
    this.#camera = camera;
  }

  center(): Coordinate {
    return this.#camera.centre();
  }

  /** Whether the square is on the screen, `margin` squares in from its edges, and not under what floats over the map. */
  isVisible(x: number, y: number, margin: number = 0): boolean {
    return this.#camera.visible(x, y, margin);
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
    this.#camera.changed();
  }

  scale(): number {
    return this.#deps.art.scale();
  }

  /** Glides the camera to look at the square at (`x`, `y`), unless it does already. */
  setCenter(x: number, y: number): void {
    this.#camera.centreOn(x, y);
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
