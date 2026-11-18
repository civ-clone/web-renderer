// The 3D map (`MapRenderer`, docs/3d-renderer.md §2.1), behind `?3d=1` until it shows everything the 2D map does (§11).
//
// It shows the land (slice 1.1), its relief and its terrain's colours, built a few chunks a frame from where the map is
//  centred, and again where tile patches change it; the camera looks down at the square the map is centred on. The
//  rest comes slice by slice:
//  - turning, tilting and zooming the camera in 1.2;
//  - picking squares, hovering and hiding the units in 1.3.
//  - the minimap's view of it in 1.5: it's left empty until then.
// Until then, what the game asks of it is kept or let go as below, and a long-range order's square can't be picked: the
//  order is given up, as if the player had.
//
// Reaches beyond its canvas in one place, as the 2D map does: the `window` `resize` handler and an observer of the
//  canvas's parent, which size the canvas to it.

import { Coordinate, Tile, Unit } from '@civ-clone/ui-protocol/types';
import { MapEvent } from '@civ-clone/ui-protocol/mapEvents';
import { MapView3DDeps } from '@civ-clone/ui-map/MapView3DFactory';
import MapPortal3D from './MapPortal3D';
import MapRenderer from '@civ-clone/ui-map/MapRenderer';
import World from '@civ-clone/ui-map/components/World';
import { Stage, StageFactory, createStage } from './stage';
import Land from './Land';

// How long, in ms, each frame may go on building the land's chunks while any wait. A chunk is built whole, once a frame
//  has begun one: one takes 17–25 ms, so a frame builds one, and more only where they're quicker.
const BUILD_BUDGET = 10;

export class MapView3D implements MapRenderer {
  readonly portal: MapPortal3D;
  readonly world: World;

  #canvas: HTMLCanvasElement;
  #land: Land;
  #stage: Stage;
  // The `?debug=1` overlay: frame time, draw calls, triangles and chunks waiting (§12).
  #stats: HTMLElement | null = null;
  #frameTime = 0;
  // Where the map was centred when the chunks waiting were last put in order, as `u,v`.
  #focused = '';
  // A frame asked for to draw in, if one is.
  #frame: number | null = null;
  // Keyed by the square, as the 2D map's: a tile waits in `#incomingTiles` until the world has it (`releaseTiles`).
  #incomingTiles = new Map<string, Tile>();
  #tilesToDraw = new Map<string, Tile>();
  // The world's tiles, and how many, when its terrain was last read: replaced, it's read again.
  #worldTiles: Tile[] = [];
  #worldTileCount = 0;
  #activeUnit: Unit | null = null;
  #pendingTile: Coordinate | null = null;
  #unitsShown = true;
  #yieldsShown = false;
  #waiting = false;
  // The 2D art the city screen and windows draw with, as it was when last asked.
  #art: MapView3DDeps['art'];
  #artId: string;
  // The canvas's box and the screen's pixels per px it was last sized to, as `width×height@ratio`.
  #size = '';
  #resizeHandler = (): void => this.#resize();
  #resizeObserver: ResizeObserver | null = null;
  #disposed = false;

  constructor(deps: MapView3DDeps, stageFactory: StageFactory = createStage) {
    this.#canvas = deps.mapCanvas;
    this.#art = deps.art;
    this.#artId = deps.art.id();
    this.world = deps.world;
    this.portal = new MapPortal3D(deps, () => this.#draw());
    this.#land = new Land(deps.world);
    // Read just now, by the land.
    this.#worldTiles = deps.world.tiles();
    this.#worldTileCount = this.#worldTiles.length;
    this.#stage = stageFactory(deps.mapCanvas, {
      copies: this.#land.copies(),
    });

    if (deps.debug && deps.mapCanvas.parentElement) {
      this.#stats = this.#statsOverlay(deps.mapCanvas.parentElement);
      // For the console, as `?debug=1` tooling is.
      (window as unknown as { civMap3DView?: MapView3D }).civMap3DView = this;
    }

    this.#land.queueAll(...this.#focus());

    this.portal.on('activate-unit', (unit) => deps.activateUnit(unit));

    window.addEventListener('resize', this.#resizeHandler);

    // Not everywhere the map is built has one (the tests' DOM doesn't).
    if (typeof ResizeObserver !== 'undefined' && deps.mapCanvas.parentElement) {
      this.#resizeObserver = new ResizeObserver(this.#resizeHandler);
      this.#resizeObserver.observe(deps.mapCanvas.parentElement);
    }

    this.#resize();
    // The land built from the start, wherever the map is centred: centring it on the square it's on already asks for
    //  nothing.
    this.#draw();
  }

  /** The land, for the `?debug=1` console. */
  land(): Land {
    return this.#land;
  }

  /** The unit active now, and where it's drawn while its move is answered. */
  activeUnit(): { unit: Unit | null; pendingTile: Coordinate | null } {
    return { unit: this.#activeUnit, pendingTile: this.#pendingTile };
  }

  centre(tile: Tile): void {
    this.portal.setCenter(tile.x, tile.y);
  }

  /** Nothing to flip yet: the stress runner's view modes are the 2D map's layers. */
  debugViewModes(): (() => void)[] {
    return [];
  }

  dispose(): void {
    this.#disposed = true;
    window.removeEventListener('resize', this.#resizeHandler);
    this.#resizeObserver?.disconnect();

    if (this.#frame !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.#frame);
    }

    this.#frame = null;
    this.#stats?.remove();
    this.#stage.dispose();

    const page = window as unknown as { civMap3DView?: MapView3D };

    // Not kept for the console once taken down, with its land and world.
    if (page.civMap3DView === this) {
      delete page.civMap3DView;
    }
  }

  endPicking(): void {}

  /** The tiles released so far are taken, the land they change queued to be built again, and the map drawn. */
  flush(): void {
    this.#takeTiles();
    this.#draw();
  }

  /** Nothing is animated yet (slice 2.3). */
  mapEvent(event: MapEvent): void {
    void event;
  }

  /** Nothing floats over anything to keep the active unit out from under yet (slice 1.2). */
  measureCovered(): void {}

  /** No square can be picked yet (slice 1.3): the order is given up, as if the player had. */
  pickTile(
    accept: (tile: Tile) => boolean,
    onPick: (tile: Tile) => void,
    prompt: string
  ): void {
    void [accept, onPick, prompt];
  }

  picking(): boolean {
    return false;
  }

  queueTile(tile: Tile): void {
    this.#incomingTiles.set(`${tile.x},${tile.y}`, tile);
  }

  /**
   * The 3D map isn't drawn with the 2D art, but the unit panel and windows are, so another set chosen mid-game (#1118)
   *  is `redrawn`, for the game to draw them again with it.
   */
  redrawArt(): 'redrawn' | 'unchanged' {
    const id = this.#art.id();

    if (id === this.#artId) {
      return 'unchanged';
    }

    this.#artId = id;

    return 'redrawn';
  }

  /** The world has the queued tiles now: they're taken on the next frame, if a flush doesn't take them first. */
  releaseTiles(): void {
    this.#incomingTiles.forEach((tile, key) =>
      this.#tilesToDraw.set(key, tile)
    );
    this.#incomingTiles.clear();

    if (this.#tilesToDraw.size > 0) {
      this.#draw();
    }
  }

  setActiveUnit(unit: Unit | null, pendingTile?: Coordinate | null): void {
    this.#activeUnit = unit;
    this.#pendingTile = pendingTile ?? null;
  }

  setWaiting(waiting: boolean): void {
    this.#waiting = waiting;
  }

  /**
   * Brings the units back if they were hidden (`t`), as the 2D map does for a unit to give orders to. The squares it
   *  changed are drawn with the units (slice 2.1).
   */
  showActiveUnit(changed: Tile[]): void {
    void changed;

    this.#unitsShown = true;
  }

  /** Whether the units, the yields, and waiting for the next turn are shown, as asked. */
  shown(): { units: boolean; yields: boolean; waiting: boolean } {
    return {
      units: this.#unitsShown,
      yields: this.#yieldsShown,
      waiting: this.#waiting,
    };
  }

  tilesPending(): number {
    return this.#tilesToDraw.size;
  }

  toggleUnits(): void {
    this.#unitsShown = !this.#unitsShown;
  }

  toggleYields(): void {
    this.#yieldsShown = !this.#yieldsShown;
  }

  /** The camera's zoom is slice 1.2's. */
  zoomBy(steps: number): void {
    void steps;
  }

  // The square the map is centred on, on the ground.
  #focus(): [number, number] {
    const { x, y } = this.portal.center();

    return [...this.#land.layout.centre(x, y)];
  }

  // The tiles released, their squares' land queued to be built again. The world's terrain is read again even with
  //  none released when its tiles have been replaced, as a whole new world may have none: not otherwise, as reading
  //  it all takes milliseconds.
  #takeTiles(): void {
    const squares = [...this.#tilesToDraw.values()].map(
        ({ x, y }): [number, number] => [x, y]
      ),
      tiles = this.world.tiles(),
      replaced =
        tiles !== this.#worldTiles || tiles.length !== this.#worldTileCount;

    this.#worldTiles = tiles;
    this.#worldTileCount = tiles.length;
    this.#tilesToDraw.clear();
    this.#land.changed(squares, ...this.#focus(), replaced);
  }

  // A frame: the tiles released taken, as many chunks built as the budget allows (every one, where there are no
  //  frames to spread them over), the camera on the square the map is centred on, and the scene drawn. Another frame
  //  is asked for while chunks wait.
  #frameDrawn(budget: number | null): void {
    const started = performance.now(),
      [u, v] = this.#focus();

    this.#takeTiles();

    // Centred elsewhere since: the chunks nearest the new centre are built first.
    if (`${u},${v}` !== this.#focused) {
      this.#focused = `${u},${v}`;
      this.#land.refocus(u, v);
    }

    this.#land.build(this.#stage, budget);
    // Over the sea, at the sea's surface.
    this.#stage.lookAt(u, v, Math.max(0, this.#land.heightAt(u, v)));
    this.#stage.render();
    this.#frameTime = performance.now() - started;
    this.#showStats();

    if (this.#land.pending() > 0) {
      this.#draw();
    }
  }

  // Drawn on the next frame, once however often it's asked for in one.
  #draw(): void {
    // Taken down: nothing left to draw on.
    if (this.#disposed) {
      return;
    }

    if (typeof requestAnimationFrame !== 'function') {
      this.#frameDrawn(null);

      return;
    }

    if (this.#frame !== null) {
      return;
    }

    this.#frame = requestAnimationFrame(() => {
      this.#frame = null;
      this.#frameDrawn(BUILD_BUDGET);
    });
  }

  // Over the map's bottom left corner, after the canvas so it's drawn over it.
  #statsOverlay(parent: HTMLElement): HTMLElement {
    const overlay = document.createElement('pre');

    overlay.className = 'map3d-stats';
    overlay.setAttribute('aria-hidden', 'true');
    Object.assign(overlay.style, {
      background: 'var(--ui-overlay-bg, rgba(0, 0, 0, 0.6))',
      color: 'var(--ui-overlay-fg, #fff)',
      font: '12px/1.4 monospace',
      left: '0.5rem',
      margin: '0',
      padding: '0.25rem 0.5rem',
      pointerEvents: 'none',
      position: 'absolute',
      bottom: '0.5rem',
    });
    parent.append(overlay);

    return overlay;
  }

  #showStats(): void {
    if (this.#stats === null) {
      return;
    }

    const { drawCalls, triangles, geometries } = this.#stage.stats();

    this.#stats.textContent = [
      `frame ${this.#frameTime.toFixed(1)} ms`,
      `draw calls ${drawCalls}`,
      `triangles ${triangles.toLocaleString()}`,
      `geometries ${geometries}`,
      `chunks waiting ${this.#land.pending()}`,
    ].join('\n');
  }

  // Sized to its parent's box, only when that or the screen's pixels have changed: sizing a canvas clears it, even to
  //  the size it has (as `MapView2D#resize` says). Drawn at once, so a resize never shows a cleared canvas for a frame.
  //  A box with no size yet (a layout not settled) is left until it has one.
  #resize(): void {
    const parent = this.#canvas.parentElement,
      width = parent?.offsetWidth ?? 0,
      height = parent?.offsetHeight ?? 0,
      ratio = window.devicePixelRatio || 1,
      size = `${width}×${height}@${ratio}`;

    if (width === 0 || height === 0 || size === this.#size) {
      return;
    }

    this.#size = size;
    this.#stage.resize(width, height, ratio);
    this.#stage.render();
  }
}

export default MapView3D;
