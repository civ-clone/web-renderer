import { Tile, Unit, World as WorldData } from '../types';
import { CityOpener } from '../lib/cityOpeners';
import { off, on } from '@dom111/element';
import ActiveUnit from '../components/Map/ActiveUnit';
import Cities from '../components/Map/Cities';
import CityNames from '../components/Map/CityNames';
import Fog from '../components/Map/Fog';
import GamePortal from '../components/GamePortal';
import IntervalHandler from '../lib/IntervalHandler';
import Landscape from '../components/Map/Landscape';
import Minimap from '../components/Minimap';
import Overview from '../components/Map/Overview';
import Transport from '../Transport';
import Units from '../components/Map/Units';
import World from '../components/World';
import Yields from '../components/Map/Yields';
import currentTileset, { nativeTileSize } from '../lib/tilesets';

// The map: the world the layers look tiles up in, the portal and its layers, the minimap, the active unit's blink, and
//  the tiles waiting to be redrawn.
//
// Reaches beyond its own canvases in one place: the `window` `resize` handler, and an observer of the map's parent
//  (`#map`), size the map's canvas to that parent, as the game sizes it once at the start. The observer is for the
//  parent changing size on its own: the top bar above it is filled in after the game sizes the canvas, and grows or
//  shrinks as its contents wrap (#697). Without it the canvas is drawn taller than its box, squashed to fit, and a
//  click lands on the wrong tile.
//
// The `resize` handler, the portal's `focus-changed` and `activate-unit` and the blink tick are live from the
//  constructor on. If `GameSession#start` throws after building this, before it has made the active unit's controller,
//  they stay live against a game that never started, reading a controller that was never set: the game is dead either
//  way, and nothing disposes them.

export type MapViewDeps = {
  // The portal's `activate-unit`: a unit picked on the map.
  activateUnit: (unit: Unit) => void;
  // Read on every minimap update, so always the unit active now.
  activeUnit: () => Unit | null;
  // How a city opens from the map (`lib/cityOpeners.ts`): the player's own, or a watcher's.
  cityOpener: CityOpener;
  // What floats over the map (the sidebar's sections, #697): the active unit is kept out from under them.
  coveredBy?: HTMLElement[];
  mapPortal: HTMLCanvasElement;
  minimapCanvas: HTMLCanvasElement;
  options: { get(key: string, defaultValue?: any): any };
  playerId: string;
  transport: Transport;
  world: WorldData;
};

export class MapView {
  readonly activeUnitLayer: ActiveUnit;
  readonly citiesLayer: Cities;
  readonly cityNamesLayer: CityNames;
  readonly minimap: Minimap;
  readonly overviewLayer: Overview;
  readonly portal: GamePortal;
  readonly unitsLayer: Units;
  readonly world: World;
  readonly yieldsLayer: Yields;

  #coveredBy: HTMLElement[];
  #intervalHandler: IntervalHandler;
  #mapPortal: HTMLCanvasElement;
  #measureHandler = (): void => this.measureCovered();
  #resizeHandler = (): void => this.#resize();
  #scrollers: HTMLElement[] = [];
  #resizeObserver: ResizeObserver | null = null;

  // Keyed by coordinate: a tile resent several times between two renders
  // only needs building once. A layer redraws a tile by looking its
  // coordinates up in `world`, so a patched tile is only ready to render
  // once `GameState`'s update has refreshed `world`: until then it waits in
  // `#incomingTiles`. While waiting for the turn that can be a frame or
  // more, and a render in between would draw the tile as it was.
  #incomingTiles = new Map<string, Tile>();
  #tilesToRender = new Map<string, Tile>();

  constructor({
    activateUnit,
    activeUnit,
    cityOpener,
    coveredBy = [],
    mapPortal,
    minimapCanvas,
    options,
    playerId,
    transport,
    world: worldData,
  }: MapViewDeps) {
    this.#coveredBy = coveredBy;
    this.#mapPortal = mapPortal;

    const world = new World(worldData),
      intervalHandler = new IntervalHandler(),
      tileset = currentTileset(),
      portal = new GamePortal(
        world,
        transport,
        mapPortal,
        {
          cityOpener,
          lockVerticalEdges: options.get('lockVerticalEdges', false),
          playerId,
          scale: options.get('mapScale', tileset.defaultScale),
          tileSize: nativeTileSize(tileset),
        },
        Landscape,
        // Never composited onto the map; it rides in the layer list so
        // `portal.build()` feeds it tile updates like any other layer.
        Overview,
        Fog,
        Yields,
        Units,
        Cities,
        CityNames,
        ActiveUnit
      ),
      overviewMap = portal.getLayer(Overview) as Overview,
      activeUnitsMap = portal.getLayer(ActiveUnit) as ActiveUnit;

    this.world = world;
    this.#intervalHandler = intervalHandler;
    this.portal = portal;
    this.overviewLayer = overviewMap;
    this.yieldsLayer = portal.getLayer(Yields) as Yields;
    this.unitsLayer = portal.getLayer(Units) as Units;
    this.citiesLayer = portal.getLayer(Cities) as Cities;
    this.cityNamesLayer = portal.getLayer(CityNames) as CityNames;
    this.activeUnitLayer = activeUnitsMap;
    this.minimap = new Minimap(
      minimapCanvas,
      world,
      portal,
      overviewMap,
      // The marker shares the main map's blink phase, so the active
      // unit can be found on the minimap and clicked to centre
      // without reaching for the keyboard.
      () => {
        const unit = activeUnit();

        return unit && activeUnitsMap.isVisible() ? unit.tile : null;
      }
    );

    this.yieldsLayer.setVisible(false);

    portal.on('focus-changed', () => this.minimap.update());
    portal.on('activate-unit', (unit) => activateUnit(unit));

    intervalHandler.on(() => this.#tick());

    on(window, 'resize', this.#resizeHandler);

    // Not everywhere the map is built has one (the tests' DOM doesn't).
    if (typeof ResizeObserver !== 'undefined' && mapPortal.parentElement) {
      this.#resizeObserver = new ResizeObserver(this.#resizeHandler);
      this.#resizeObserver.observe(mapPortal.parentElement);

      // A section collapsing changes what it covers.
      coveredBy.forEach((element) => this.#resizeObserver!.observe(element));
    }

    // Scrolling the sidebar moves what it covers without resizing anything.
    this.#scrollers = [
      ...new Set(
        coveredBy
          .map((element) => element.parentElement)
          .filter((parent): parent is HTMLElement => parent !== null)
      ),
    ];
    this.#scrollers.forEach((scroller) =>
      on(scroller, 'scroll', this.#measureHandler)
    );

    this.measureCovered();
  }

  /** Centres the map on `tile` and redraws it (`c`). */
  centre(tile: Tile): void {
    this.portal.setCenter(tile.x, tile.y);

    this.portal.render();
    this.minimap.update();
  }

  dispose(): void {
    off(window, 'resize', this.#resizeHandler);
    this.#resizeObserver?.disconnect();
    this.#scrollers.forEach((scroller) =>
      off(scroller, 'scroll', this.#measureHandler)
    );
    this.#intervalHandler.dispose();
  }

  /** Builds the tiles released so far, then composites the map and updates the minimap. */
  flush(): void {
    // ensure UI looks responsive
    this.portal.build(this.takeTiles());
    this.portal.render();

    this.minimap.update();
  }

  /** A tile a patch has changed: drawn once `releaseTiles` says the world has it. */
  queueTile(tile: Tile): void {
    this.#incomingTiles.set(`${tile.x},${tile.y}`, tile);
  }

  /** The world has been refreshed, so the queued tiles can be drawn. */
  releaseTiles(): void {
    this.#incomingTiles.forEach((tile, key) =>
      this.#tilesToRender.set(key, tile)
    );
    this.#incomingTiles.clear();
  }

  /** The tiles released and not yet built, taken: whoever takes them builds them. */
  takeTiles(): Tile[] {
    const tiles = [...this.#tilesToRender.values()];

    this.#tilesToRender.clear();

    return tiles;
  }

  /** How many released tiles wait to be built. */
  tilesPending(): number {
    return this.#tilesToRender.size;
  }

  /** Shows or hides the units, cities and city names (`t`). */
  toggleUnits(): void {
    this.unitsLayer.setVisible(!this.unitsLayer.isVisible());
    this.citiesLayer.setVisible(!this.citiesLayer.isVisible());
    this.cityNamesLayer.setVisible(!this.cityNamesLayer.isVisible());

    this.portal.render();
  }

  /** Shows or hides the yields (`y`). */
  toggleYields(): void {
    this.yieldsLayer.setVisible(!this.yieldsLayer.isVisible());

    this.portal.render();
  }

  /**
   * Where the floating parts of the interface sit on the canvas, in its px, for the portal to keep the active unit out
   *  from under. None, in a layout that puts them beside the map rather than over it. Each is cut to its container's
   *  box, as the sidebar scrolls what doesn't fit. Called again whenever they may have changed: a resize, the sidebar
   *  scrolling, and the unit's section being filled in or hidden, before its unit is checked (#697).
   */
  measureCovered(): void {
    const mapPortal = this.#mapPortal,
      canvas = mapPortal.getBoundingClientRect(),
      scaleX = canvas.width > 0 ? mapPortal.width / canvas.width : 1,
      scaleY = canvas.height > 0 ? mapPortal.height / canvas.height : 1;

    this.portal.setCovered(
      this.#coveredBy
        .map((element) => {
          const box = element.getBoundingClientRect(),
            container = element.parentElement?.getBoundingClientRect() ?? box;

          return {
            left: Math.max(box.left, container.left, canvas.left),
            top: Math.max(box.top, container.top, canvas.top),
            right: Math.min(box.right, container.right, canvas.right),
            bottom: Math.min(box.bottom, container.bottom, canvas.bottom),
          };
        })
        .filter(({ left, top, right, bottom }) => right > left && bottom > top)
        .map(({ left, top, right, bottom }) => ({
          x: (left - canvas.left) * scaleX,
          y: (top - canvas.top) * scaleY,
          width: (right - left) * scaleX,
          height: (bottom - top) * scaleY,
        }))
    );
  }

  #resize(): void {
    const mapPortal = this.#mapPortal,
      width = (mapPortal.parentElement as HTMLElement).offsetWidth,
      height = (mapPortal.parentElement as HTMLElement).offsetHeight;

    // Assigning either of these clears the canvas even when the
    // value has not changed, and the portal composites what changed
    // rather than everything, so a resize that resizes nothing
    // would wipe the map and put nothing back.
    if (mapPortal.width === width && mapPortal.height === height) {
      // A section collapsing changes what is covered, but not the map.
      this.measureCovered();

      return;
    }

    mapPortal.width = width;
    mapPortal.height = height;

    this.measureCovered();

    // The layers are the size of the portal, so resizing them is
    // part of rendering now.
    this.portal.render();
    this.minimap.update();
  }

  #tick(): void {
    const activeUnitsMap = this.activeUnitLayer;

    // With no active unit the layer draws nothing, so toggling it is
    // invisible and there is no reason to composite every layer for
    // it. `ActiveUnitController#render` sets the layer visible again
    // whenever a unit becomes active, so leaving the flag alone here
    // is safe.
    const blinking = activeUnitsMap.hasActiveUnit();

    if (blinking) {
      activeUnitsMap.setVisible(!activeUnitsMap.isVisible());
    }

    const hasTilesToRender = this.#tilesToRender.size > 0;

    if (hasTilesToRender) {
      this.portal.build(this.takeTiles());
    }

    if (blinking || hasTilesToRender) {
      this.portal.render();
      this.minimap.update();
    }
  }
}

export default MapView;
