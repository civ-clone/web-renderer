// The map as the game itself drives it (docs/3d-renderer.md §2.1): what `GameSession`, `InputController` and
//  `ActiveUnitController` ask of it. The 2D map (`MapView2D`) answers it, and a 3D view will.
//
// Each is a thing the game wants done to the map ("this unit is active now", "show or hide the units"), not a layer to
//  reach into: a 3D view has no layers. What the rest of the game holds the map for is `portal`'s (`MapPortal`).

import { Coordinate, Tile, Unit } from '@civ-clone/ui-protocol/types';
import { MapEvent } from '@civ-clone/ui-protocol/mapEvents';
import MapPortal from './MapPortal';
import World from './components/World';

export interface MapRenderer {
  /** The map, as the HUD, the reports, the menus and the city screens hold it. */
  readonly portal: MapPortal;
  /** The player's world, which tile patches are written to (`setTiles`) and the map is drawn from. */
  readonly world: World;

  /** Centres the map on `tile` and draws it. */
  centre(tile: Tile): void;
  /**
   * What the `?debug=1` stress runner flips between, each a function that flips one: none, for a map with nothing to
   *  flip.
   */
  debugViewModes(): (() => void)[];
  /** Takes down what the map set up: its listeners, its timers and its observers. */
  dispose(): void;
  /** Gives up choosing a square, if one is being chosen. */
  endPicking(): void;
  /** Builds the tiles released so far, and draws the map. */
  flush(): void;
  /** A move or a battle the player sees, as it happens, before the patches that show where things are after it. */
  mapEvent(event: MapEvent): void;
  /** Measures again what floats over the map, for the active unit to be kept out from under. */
  measureCovered(): void;
  /**
   * Takes the next click on a square `accept` allows for `onPick` (a long-range order's target), with a window that
   *  says what for (`prompt`), whose closing gives up.
   */
  pickTile(
    accept: (tile: Tile) => boolean,
    onPick: (tile: Tile) => void,
    prompt: string
  ): void;
  /** Whether a square is being chosen. */
  picking(): boolean;
  /** A tile a patch has changed: drawn once `releaseTiles` says the world has it. */
  queueTile(tile: Tile): void;
  /**
   * Draws the map with the art chosen now, if that's changed: `redrawn`, `unchanged`, or `reload` where only a new page
   *  draws it as it should be.
   */
  redrawArt(): 'redrawn' | 'unchanged' | 'reload';
  /** The world has been refreshed, so the queued tiles can be drawn. */
  releaseTiles(): void;
  /**
   * The unit active now, or none, drawn on `pendingTile` while its move is answered. Not drawn yet: `showActiveUnit`
   *  draws it.
   */
  setActiveUnit(unit: Unit | null, pendingTile?: Coordinate | null): void;
  /**
   * Whether the game is waiting for the next turn: the map's tooltips don't open meanwhile. It still takes clicks and
   *  picks squares; the game decides what comes of them.
   */
  setWaiting(waiting: boolean): void;
  /**
   * Draws the active unit again, and the squares a change of active unit touched (`changed`), and shows the units, if
   *  they were hidden. The map isn't drawn: the caller draws it.
   */
  showActiveUnit(changed: Tile[]): void;
  /** How many released tiles wait to be built. */
  tilesPending(): number;
  /** Shows or hides the units, cities and city names (`t`). */
  toggleUnits(): void;
  /** Shows or hides the yields (`y`). */
  toggleYields(): void;
  /** Zooms in `steps` tenths, or out where it's less than none, about the middle. */
  zoomBy(steps: number): void;
}

export default MapRenderer;
