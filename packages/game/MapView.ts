import { Tile, Unit, World as WorldData } from '@civ-clone/ui-protocol/types';
import { CityOpener } from '@civ-clone/ui-hud/lib/cityOpeners';
import { off, on } from '@dom111/element';
import ActiveUnit from '@civ-clone/ui-map/components/Map/ActiveUnit';
import Cities from '@civ-clone/ui-map/components/Map/Cities';
import cityLabels, {
  CityLabels,
} from '@civ-clone/ui-map/components/Map/cityLabels';
import Fog from '@civ-clone/ui-map/components/Map/Fog';
import GamePortal from './GamePortal';
import IntervalHandler from '@civ-clone/ui-client/lib/IntervalHandler';
import Landscape from '@civ-clone/ui-map/components/Map/Landscape';
import { Map as MapLayer } from '@civ-clone/ui-map/components/Map';
import Transport from '@civ-clone/ui-client/Transport';
import UnitMarker, {
  UnitMarkerMode,
  unitMarkerMode,
} from '@civ-clone/ui-map/components/Map/UnitMarker';
import Units from '@civ-clone/ui-map/components/Map/Units';
import World from '@civ-clone/ui-map/components/World';
import Yields from '@civ-clone/ui-map/components/Map/Yields';
import currentTileset, {
  nativeTileSize,
} from '@civ-clone/ui-assets/lib/tilesets';
import { GridMinimap, overviewFor } from '@civ-clone/ui-map/lib/projectionFor';

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
  readonly cityNamesLayer: MapLayer;
  // The grid's own (#867): the tileset's grid registered them with its projection.
  readonly minimap: GridMinimap;
  readonly overviewLayer: MapLayer;
  readonly portal: GamePortal;
  readonly unitsLayer: Units;
  readonly world: World;
  readonly yieldsLayer: Yields;

  // What names the cities, and what it asks of the map (#861).
  #cityLabels: CityLabels;
  #coveredBy: HTMLElement[];
  #intervalHandler: IntervalHandler;
  #mapPortal: HTMLCanvasElement;
  // The ring round the active unit, and how the unit is marked now: read again each blink, so a choice in Options or
  //  the theme changing takes at the next (#753).
  #marker: UnitMarker;
  #markerMode: () => UnitMarkerMode;
  #mode: UnitMarkerMode;
  // Where the minimap's marker was last drawn for the ring: the unit's square, not the ring's place on screen.
  #minimapMarked: string | null = null;
  #activeUnit: () => Unit | null;
  #measureHandler = (): void => this.measureCovered();
  #resizeHandler = (): void => this.#resize();
  #scrollers: HTMLElement[] = [];
  #resizeObserver: ResizeObserver | null = null;
  // The theme, light or dark, or the fonts loaded, changing: the city banners draw with the theme's tokens (#747).
  #themeObserver: MutationObserver | null = null;
  #schemeQuery: MediaQueryList | null = null;
  #fonts: FontFaceSet | null = null;
  #restyleHandler = (): void => this.#restyle();
  // Whether `t` shows the units, cities and city names, which the yields can hide the city names apart from.
  #unitsShown = true;

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
    this.#cityLabels = cityLabels.current();
    this.#coveredBy = coveredBy;
    this.#mapPortal = mapPortal;
    this.#marker = new UnitMarker(mapPortal);
    this.#activeUnit = activeUnit;
    this.#markerMode = () => unitMarkerMode(options.get('unitMarker', 'theme'));
    this.#mode = this.#markerMode();

    const world = new World(worldData),
      intervalHandler = new IntervalHandler(),
      tileset = currentTileset(),
      overview = overviewFor(tileset),
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
        overview.layer,
        Fog,
        Yields,
        Units,
        Cities,
        // The banners, which the classic theme draws as these labels, or the classic labels (#747).
        this.#cityLabels.layer,
        ActiveUnit
      ),
      overviewMap = portal.getLayer(overview.layer)!,
      activeUnitsMap = portal.getLayer(ActiveUnit) as ActiveUnit;

    this.world = world;
    this.#intervalHandler = intervalHandler;
    this.portal = portal;
    this.overviewLayer = overviewMap;
    this.yieldsLayer = portal.getLayer(Yields) as Yields;
    this.unitsLayer = portal.getLayer(Units) as Units;
    this.citiesLayer = portal.getLayer(Cities) as Cities;
    this.cityNamesLayer = portal.getLayer(this.#cityLabels.layer) as MapLayer;
    this.activeUnitLayer = activeUnitsMap;
    this.minimap = new overview.minimap(
      minimapCanvas,
      world,
      portal,
      overviewMap,
      // The marker shares the main map's blink phase, so the active
      // unit can be found on the minimap and clicked to centre
      // without reaching for the keyboard. With the units hidden (`t`)
      // there's no blink, and the minimap, an overview whatever the map
      // shows, marks it throughout (#804).
      () => {
        const unit = activeUnit();

        return unit && (!this.#unitsShown || activeUnitsMap.isVisible())
          ? unit.tile
          : null;
      }
    );

    this.yieldsLayer.setVisible(false);

    portal.on('focus-changed', () => this.minimap.update());
    portal.on('rendered', () => this.#placeMarker());
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

    // Not everywhere the map is built has these (the tests' DOM doesn't).
    if (
      this.#cityLabels.followTheme &&
      typeof MutationObserver !== 'undefined'
    ) {
      this.#themeObserver = new MutationObserver(this.#restyleHandler);
      this.#themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme', 'data-ui-theme'],
      });

      this.#schemeQuery =
        window.matchMedia?.('(prefers-color-scheme: dark)') ?? null;
      // Older Safari's list has only `addListener`: there, the banners follow the theme only when it's chosen.
      this.#schemeQuery?.addEventListener?.('change', this.#restyleHandler);

      // A canvas doesn't wait for a web font: drawn before it loaded, the banners are drawn again once it has.
      this.#fonts = document.fonts ?? null;
      this.#fonts?.addEventListener?.('loadingdone', this.#restyleHandler);
    }
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
    this.#themeObserver?.disconnect();
    this.#schemeQuery?.removeEventListener?.('change', this.#restyleHandler);
    this.#fonts?.removeEventListener?.('loadingdone', this.#restyleHandler);
    this.#scrollers.forEach((scroller) =>
      off(scroller, 'scroll', this.#measureHandler)
    );
    this.#intervalHandler.dispose();
    this.#marker.dispose();
  }

  /** The ring, where it's drawn round the unit now (#753). */
  marker(): UnitMarker {
    return this.#marker;
  }

  // The ring placed again: where the unit it marks is another, the minimap follows, which the blink's tick would
  //  otherwise have redrawn. Panning moves the ring but not the unit, and the portal's `focus-changed` redraws the
  //  minimap for that.
  #placeMarker(): void {
    // Not while the units are hidden (`t`), the unit awaiting orders with them (#804).
    const shown =
      this.#unitsShown &&
      this.#mode !== 'blink' &&
      this.activeUnitLayer.hasActiveUnit();

    this.#marker.place(this.activeUnitLayer.squares(), shown);

    // The unit's square alone: whether it's blinked out is the tick's, which redraws the minimap for it.
    const tile = shown ? this.#activeUnit()?.tile ?? null : null,
      marked = tile === null ? null : `${tile.x},${tile.y}`;

    if (marked !== this.#minimapMarked) {
      this.#minimapMarked = marked;
      this.minimap.update();
    }
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
    this.#showUnits(!this.#unitsShown);
  }

  // The units, cities and city names, and the unit awaiting orders and its ring with them, so the square under it can
  //  be seen (#804). Shown again, the unit blinks or is ringed as before.
  #showUnits(shown: boolean): void {
    this.#unitsShown = shown;

    this.unitsLayer.setVisible(shown);
    this.citiesLayer.setVisible(shown);
    this.activeUnitLayer.setVisible(shown);
    this.#showCityNames();
    this.#placeMarker();

    this.portal.render();
    // Its marker steady while they're hidden, and blinking again once they're not: in the blink, nothing else would
    //  redraw it.
    this.minimap.update();
  }

  /** Shows or hides the yields (`y`). */
  toggleYields(): void {
    this.yieldsLayer.setVisible(!this.yieldsLayer.isVisible());
    this.#showCityNames();

    this.portal.render();
  }

  // The city names are shown with the units, and the new interface's banners (#747) give way to the yields too, as
  //  they're wide enough to cover a row of them; with the yields gone, they're back only if the units are.
  #showCityNames(): void {
    this.cityNamesLayer.setVisible(
      this.#unitsShown &&
        !(this.#cityLabels.giveWayToYields && this.yieldsLayer.isVisible())
    );
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

  // The banners read the theme's tokens again, and are drawn with them and the fonts loaded now.
  #restyle(): void {
    if (!this.#cityLabels.followTheme) {
      return;
    }

    this.cityNamesLayer.render();
    this.portal.render();
  }

  #tick(): void {
    const activeUnitsMap = this.activeUnitLayer;

    // Hidden with `t`, and brought back since by the unit awaiting orders changing or moving, which shows the units
    //  (`ActiveUnitController#render`): the cities, their names and the ring come back with them.
    if (!this.#unitsShown && this.unitsLayer.isVisible()) {
      this.#showUnits(true);
    }

    // With no active unit the layer draws nothing, so toggling it is
    // invisible and there is no reason to composite every layer for
    // it. `ActiveUnitController#render` sets the layer visible again
    // whenever a unit becomes active, so leaving the flag alone here
    // is safe.
    const mode = this.#markerMode(),
      changed = mode !== this.#mode,
      hasActiveUnit = activeUnitsMap.hasActiveUnit() && this.#unitsShown,
      // A ring alone marks the unit: it's drawn throughout, and only the ring moves (#753).
      blinking =
        hasActiveUnit && (mode !== 'ring' || !activeUnitsMap.isVisible());

    this.#mode = mode;

    if (blinking) {
      activeUnitsMap.setVisible(mode === 'ring' || !activeUnitsMap.isVisible());
    }

    // Chosen now: the ring comes or goes without waiting for the map to move.
    if (changed) {
      this.#placeMarker();
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
