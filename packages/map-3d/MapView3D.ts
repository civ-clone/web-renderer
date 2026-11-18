// The 3D map (`MapRenderer`, docs/3d-renderer.md §2.1), behind `?3d=1` until it shows everything the 2D map does (§11).
//
// It shows the land (slice 1.1), its relief and its terrain's colours, built a few chunks a frame from where the map is
//  centred, and again where tile patches change it. The camera (slice 1.2) orbits a point on the ground: centring the
//  map glides it there, the keys turn it and zoom it, and its distance is kept as the 2D map's zoom is. The rest comes
//  slice by slice:
//  - dragging, tilting and pinching it, once the shared gestures are in (1.2);
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
import {
  Orbit,
  TURN_STEP,
  between,
  defaultOrbit,
  settled,
  toScreen,
  zoomed,
} from './camera/orbit';
import prefersReducedMotion from '@civ-clone/ui-map/lib/reducedMotion';
import CameraInput from './camera/CameraInput';
import markerFor from './markers/markerFor';
import pickGround from './camera/pick';

// How long, in ms, each frame may go on building the land's chunks while any wait. A chunk is built whole, once a frame
//  has begun one: one takes 17–25 ms, so a frame builds one, and more only where they're quicker.
const BUILD_BUDGET = 10;

// How long the camera takes to glide to a square it's centred on, or to turn, in ms.
const GLIDE = 350;

// How much of the way to the land's height under the focus the camera rises or falls each frame, so it doesn't jolt
//  over every hill as it moves.
const HEIGHT_EASE = 0.25;

// A square being chosen for a long-range order: which it takes, what's done with it, and the window saying what for.
type Picking = {
  accept: (tile: Tile) => boolean;
  onPick: (tile: Tile) => void;
  window: { close(): void } | null;
};

export class MapView3D implements MapRenderer {
  readonly portal: MapPortal3D;
  readonly world: World;

  #canvas: HTMLCanvasElement;
  // What floats over the map, and where it covers it, in the canvas's px from its corner (`measureCovered`).
  #coveredBy: HTMLElement[];
  #covered: { left: number; top: number; right: number; bottom: number }[] = [];
  #land: Land;
  #stage: Stage;
  // The `?debug=1` overlay: frame time, draw calls, triangles and chunks waiting (§12).
  #stats: HTMLElement | null = null;
  #frameTime = 0;
  // Where the map was centred when the chunks waiting were last put in order, as `u,v`.
  #focused = '';
  // The camera now, the one it's gliding to, if it is, and the height it looks at, following the land's.
  #orbit: Orbit;
  #glide: { from: Orbit; to: Orbit; started: number | null } | null = null;
  #lookHeight: number | null = null;
  // The mouse, the wheel and touch moving the camera; and where its distance is kept, and what was kept last.
  #input: CameraInput;
  #distance: MapView3DDeps['cameraDistance'];
  #keptDistance: number | null;
  // What a square does when clicked or held, the page's; and a square being chosen for a long-range order, if one is.
  #squares: MapView3DDeps['squares'];
  #transport: MapView3DDeps['transport'];
  #picking: Picking | null = null;
  // The squares marked now, by `x,y`, each with what it was marked with, so a square marked the same is left alone.
  #marked = new Map<string, string>();
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
    this.#coveredBy = deps.coveredBy;
    this.#art = deps.art;
    this.#artId = deps.art.id();
    this.world = deps.world;
    this.#land = new Land(deps.world);
    // Read just now, by the land.
    this.#worldTiles = deps.world.tiles();
    this.#worldTileCount = this.#worldTiles.length;
    this.#distance = deps.cameraDistance;
    this.#keptDistance = deps.cameraDistance.get();
    this.#orbit = this.#settle({
      ...defaultOrbit(this.#land.layout.centre(0, 0)),
      ...(this.#keptDistance === null ? {} : { distance: this.#keptDistance }),
    });
    this.portal = new MapPortal3D(deps, {
      centre: () => this.#centreSquare(),
      centreOn: (x, y) => this.#centreOn(x, y),
      changed: () => this.#draw(),
      visible: (x, y, margin) => this.#visible(x, y, margin),
    });
    this.#stage = stageFactory(deps.mapCanvas, {
      period: this.#land.layout.period(),
    });

    if (deps.debug && deps.mapCanvas.parentElement) {
      this.#stats = this.#statsOverlay(deps.mapCanvas.parentElement);
      // For the console, as `?debug=1` tooling is.
      (window as unknown as { civMap3DView?: MapView3D }).civMap3DView = this;
    }

    this.#land.queueAll(...this.#focus());
    this.#markAll();

    this.portal.on('activate-unit', (unit) => deps.activateUnit(unit));

    this.#squares = deps.squares;
    this.#transport = deps.transport;
    this.#input = new CameraInput(
      deps.mapCanvas,
      {
        orbit: () => this.#orbit,
        lookHeight: () => this.#lookHeight ?? 0,
        setOrbit: (orbit) => this.setOrbit(orbit),
      },
      {
        click: (x, y) => this.#clicked(x, y),
        menu: (x, y, clientX, clientY, pressed) =>
          this.#menu(x, y, clientX, clientY, pressed),
        menuOnRightClick: () => this.#squares.menuOnRightClick(),
      }
    );

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

  /** The camera now, for the `?debug=1` console and the tests. */
  orbit(): Orbit {
    return this.#orbit;
  }

  /** The camera put where it's asked, at once, for the `?debug=1` console. */
  setOrbit(orbit: Orbit): void {
    this.#glide = null;
    this.#orbit = this.#settle(orbit);
    this.#draw();
  }

  /** The unit active now, and where it's drawn while its move is answered. */
  activeUnit(): { unit: Unit | null; pendingTile: Coordinate | null } {
    return { unit: this.#activeUnit, pendingTile: this.#pendingTile };
  }

  centre(tile: Tile): void {
    this.portal.setCenter(tile.x, tile.y);
  }

  /** Turns the view `steps` eighths of a turn: clockwise seen from above, or the other way for fewer than none. */
  turnBy(steps: number): void {
    const target = this.#glide?.to ?? this.#orbit;

    this.#moveTo({ ...target, yaw: target.yaw + steps * TURN_STEP });
  }

  /** Turns the view to look north, the short way round. */
  faceNorth(): void {
    this.#moveTo({ ...(this.#glide?.to ?? this.#orbit), yaw: 0 });
  }

  /** Nothing to flip yet: the stress runner's view modes are the 2D map's layers. */
  debugViewModes(): (() => void)[] {
    return [];
  }

  dispose(): void {
    this.#disposed = true;
    this.#input.dispose();
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

  /** Gives up choosing a square, if one is being chosen: its window goes, and a click is a click again. */
  endPicking(): void {
    const picking = this.#picking;

    if (picking === null) {
      return;
    }

    this.#picking = null;
    this.#canvas.classList.remove('picking-tile');
    picking.window?.close();
  }

  /** The tiles released so far are taken, the land they change queued to be built again, and the map drawn. */
  flush(): void {
    this.#takeTiles();
    this.#draw();
  }

  /** Nothing is animated yet (slice 2.3). */
  mapEvent(event: MapEvent): void {
    void event;
  }

  /**
   * Measures again what floats over the map (the sidebar's sections, #697), for the active unit to be kept out from
   *  under it: each cut to its container's box, as the sidebar scrolls what doesn't fit, and to the canvas's.
   */
  measureCovered(): void {
    const canvas = this.#canvas.getBoundingClientRect();

    this.#covered = this.#coveredBy
      .map((element) => {
        const box = element.getBoundingClientRect(),
          container = element.parentElement?.getBoundingClientRect() ?? box;

        return {
          left: Math.max(box.left, container.left, canvas.left) - canvas.left,
          top: Math.max(box.top, container.top, canvas.top) - canvas.top,
          right:
            Math.min(box.right, container.right, canvas.right) - canvas.left,
          bottom:
            Math.min(box.bottom, container.bottom, canvas.bottom) - canvas.top,
        };
      })
      .filter(({ left, top, right, bottom }) => right > left && bottom > top);
  }

  /**
   * Takes the next click on a square `accept` allows for `onPick` (a long-range order's target, M2b), instead of what a
   *  click does: a window says what for (`prompt`), and closing it, or Escape, gives up. A click on any other square
   *  does nothing. The map's cursor is a crosshair meanwhile, as on the 2D map. Choosing again gives up the last.
   */
  pickTile(
    accept: (tile: Tile) => boolean,
    onPick: (tile: Tile) => void,
    prompt: string
  ): void {
    this.endPicking();

    const picking: Picking = { accept, onPick, window: null };

    this.#picking = picking;
    this.#canvas.classList.add('picking-tile');
    picking.window = this.#squares.prompt(prompt, () => {
      if (this.#picking === picking) {
        this.#picking = null;
        this.#canvas.classList.remove('picking-tile');
      }
    });
  }

  /** Whether a square is being chosen for a long-range order. */
  picking(): boolean {
    return this.#picking !== null;
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

  /** Marks `unit` as the one awaiting orders, and the one before as not. */
  setActiveUnit(unit: Unit | null, pendingTile?: Coordinate | null): void {
    const before = this.#activeUnit?.tile;

    this.#activeUnit = unit;
    this.#pendingTile = pendingTile ?? null;

    [before, unit?.tile].forEach((tile) => {
      if (tile) {
        this.#mark(tile.x, tile.y);
      }
    });
    this.#draw();
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

    if (!this.#unitsShown) {
      this.#unitsShown = true;
      this.#markAll();
      this.#draw();
    }
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

  /** Hides the units, cities and their names, but the unit awaiting orders, or shows them again (`t`). */
  toggleUnits(): void {
    this.#unitsShown = !this.#unitsShown;
    this.#markAll();
    this.#draw();
  }

  toggleYields(): void {
    this.#yieldsShown = !this.#yieldsShown;
  }

  /** Brings the camera `steps` nearer, or further away for fewer than none, about the point it looks at. */
  zoomBy(steps: number): void {
    this.#orbit = zoomed(this.#orbit, steps);

    if (this.#glide !== null) {
      this.#glide.to = zoomed(this.#glide.to, steps);
    }

    this.#draw();
  }

  // Whether the square at (`x`, `y`) is on the screen: its middle, at its copy nearest the camera, `margin` squares and
  //  half a square in from the screen's edges, as big as a square is there, and not under what floats over the map.
  #visible(x: number, y: number, margin: number): boolean {
    const width = this.#canvas.clientWidth,
      height = this.#canvas.clientHeight;

    // Not laid out yet: nothing can be seen.
    if (width <= 0 || height <= 0) {
      return false;
    }

    const [u, v] = this.#land.layout.centre(x, y),
      { u: periodU, v: periodV } = this.#land.layout.period(),
      [focusU, focusV] = this.#orbit.focus,
      nearest = (value: number, focus: number, period: number | null) =>
        period === null
          ? value
          : value + period * Math.round((focus - value) / period),
      at: [number, number, number] = [
        nearest(u, focusU, periodU),
        Math.max(0, this.#land.heightAt(u, v)),
        nearest(v, focusV, periodV),
      ],
      aspect = width / height,
      look = this.#lookHeight ?? 0,
      middle = toScreen(this.#orbit, look, at, aspect),
      // A square's width there, along the screen.
      beside = toScreen(
        this.#orbit,
        look,
        [
          at[0] + Math.cos(this.#orbit.yaw),
          at[1],
          at[2] + Math.sin(this.#orbit.yaw),
        ],
        aspect
      );

    if (middle === null || beside === null) {
      return false;
    }

    const px = ((middle[0] + 1) / 2) * width,
      py = ((1 - middle[1]) / 2) * height,
      square = Math.abs(beside[0] - middle[0]) * (width / 2),
      inset = (margin + 0.5) * square;

    return (
      px >= inset &&
      px <= width - inset &&
      py >= inset &&
      py <= height - inset &&
      !this.#covered.some(
        ({ left, top, right, bottom }) =>
          px >= left - square / 2 &&
          px <= right + square / 2 &&
          py >= top - square / 2 &&
          py <= bottom + square / 2
      )
    );
  }

  // The square under (`x`, `y`) in the canvas's px: what's shown there, the land or the water over it, on the world.
  //  Nothing above the horizon, or past a pole the world doesn't wrap over.
  #tileAt(x: number, y: number): Tile | null {
    const width = this.#canvas.clientWidth,
      height = this.#canvas.clientHeight;

    if (width <= 0 || height <= 0) {
      return null;
    }

    const ground = pickGround(
      this.#orbit,
      this.#lookHeight ?? 0,
      [(x / width) * 2 - 1, 1 - (y / height) * 2],
      width / height,
      (u, v) => this.#land.heightAt(u, v)
    );

    if (ground === null) {
      return null;
    }

    const [tileX, tileY] = this.#land.layout.tileAt(...ground),
      worldWidth = this.world.width(),
      worldHeight = this.world.height(),
      wrapsY = this.#land.layout.period().v !== null;

    if (!wrapsY && (tileY < 0 || tileY >= worldHeight)) {
      return null;
    }

    return this.world.get(
      ((tileX % worldWidth) + worldWidth) % worldWidth,
      ((tileY % worldHeight) + worldHeight) % worldHeight
    );
  }

  // A click on the map: for the square being chosen, if one is, or else what a click does, as on the 2D map.
  #clicked(x: number, y: number): void {
    const tile = this.#tileAt(x, y);

    if (tile !== null) {
      this.portal.emit('tile-clicked', tile.x, tile.y);
    }

    const picking = this.#picking;

    if (picking !== null) {
      if (tile !== null && picking.accept(tile)) {
        this.endPicking();
        picking.onPick(tile);
      }

      return;
    }

    if (tile !== null) {
      this.#squares.click(this.portal, tile);
    }
  }

  // A press held, or a right-click: the active unit's menu for the square, if there is an active unit. Choosing a
  //  square ends, as the menu is another way to give the unit orders.
  #menu(
    x: number,
    y: number,
    clientX: number,
    clientY: number,
    pressed: boolean
  ): boolean {
    const unit = this.#activeUnit,
      tile = this.#tileAt(x, y);

    if (unit === null || tile === null) {
      return false;
    }

    this.endPicking();
    this.#squares.menu(
      this.portal,
      clientX,
      clientY,
      unit,
      tile,
      this.#transport,
      pressed
    );

    return true;
  }

  // The point on the ground the camera looks at.
  #focus(): [number, number] {
    return [...this.#orbit.focus];
  }

  // The square the camera looks at, on the world.
  #centreSquare(): Coordinate {
    const [x, y] = this.#land.layout.tileAt(...this.#orbit.focus),
      width = this.world.width(),
      height = this.world.height();

    return {
      x: ((x % width) + width) % width,
      y: Math.min(height - 1, Math.max(0, ((y % height) + height) % height)),
    };
  }

  // Glides the camera to look at the middle of the square at (`x`, `y`), unless it's there already.
  #centreOn(x: number, y: number): void {
    const [u, v] = this.#land.layout.centre(x, y),
      [toU, toV] = (this.#glide?.to ?? this.#orbit).focus;

    if (u === toU && v === toV) {
      return;
    }

    this.#moveTo({ ...(this.#glide?.to ?? this.#orbit), focus: [u, v] });
  }

  // The camera kept on the world: round its period, or within its rows where it doesn't wrap over the poles.
  #settle(orbit: Orbit): Orbit {
    return settled(orbit, this.#land.layout.period(), this.#land.extentV());
  }

  // The camera glides to `target`, or is put there at once where there are no frames to glide over, or the player
  //  has asked for less motion.
  #moveTo(target: Orbit): void {
    if (typeof requestAnimationFrame !== 'function' || prefersReducedMotion()) {
      this.#glide = null;
      this.#orbit = this.#settle(target);
    } else {
      this.#glide = { from: this.#orbit, to: target, started: null };
    }

    this.#draw();
  }

  // The camera this frame: part of the way along a glide, if there is one. Whether it's still moving.
  #moveCamera(now: number): boolean {
    const glide = this.#glide;

    if (glide === null) {
      return false;
    }

    glide.started ??= now;

    const t = Math.min(1, (now - glide.started) / GLIDE);

    this.#orbit = this.#settle(
      between(glide.from, glide.to, t, this.#land.layout.period())
    );

    if (t >= 1) {
      this.#glide = null;
    }

    return t < 1;
  }

  // The height the camera looks at: following the land's under the focus, no lower than the sea's surface, part of
  //  the way each frame where there are frames. Whether it's still moving.
  #followHeight(eased: boolean): boolean {
    const [u, v] = this.#orbit.focus,
      target = Math.max(0, this.#land.heightAt(u, v));

    if (!eased || this.#lookHeight === null || prefersReducedMotion()) {
      this.#lookHeight = target;

      return false;
    }

    this.#lookHeight += (target - this.#lookHeight) * HEIGHT_EASE;

    if (Math.abs(target - this.#lookHeight) < 0.002) {
      this.#lookHeight = target;

      return false;
    }

    return true;
  }

  // The tiles released: the land round any whose terrain changed queued to be built again, and each marked again. The
  //  world's terrain is read again even with none released when its tiles have been replaced, as a whole new world
  //  may have none, and every square marked before is marked again: not otherwise, as reading it all takes
  //  milliseconds.
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
    squares.forEach(([x, y]) => this.#mark(x, y));

    if (replaced) {
      this.#marked.forEach((_, key) => {
        const [x, y] = key.split(',').map(Number) as [number, number];

        this.#mark(x, y);
      });
    }
  }

  // What's on the square at (`x`, `y`), marked on the land at its middle, or nothing.
  #mark(x: number, y: number): void {
    const key = `${x},${y}`,
      marker = markerFor(
        this.world.get(x, y),
        this.#activeUnit?.id ?? null,
        this.#unitsShown
      );

    const [u, v] = this.#land.layout.centre(x, y),
      at: [number, number, number] = [
        u,
        Math.max(0, this.#land.heightAt(u, v)),
        v,
      ],
      signature = marker === null ? null : JSON.stringify([marker, at]);

    if (signature === (this.#marked.get(key) ?? null)) {
      return;
    }

    this.#stage.setMarker(key, at, marker);

    if (signature === null) {
      this.#marked.delete(key);
    } else {
      this.#marked.set(key, signature);
    }
  }

  // Every square the world has, and every one marked before.
  #markAll(): void {
    const squares = new Set(this.#marked.keys());

    this.world.tiles().forEach(({ x, y }) => squares.add(`${x},${y}`));
    squares.forEach((key) => {
      const [x, y] = key.split(',').map(Number) as [number, number];

      this.#mark(x, y);
    });
  }

  // A frame: the tiles released taken, as many chunks built as the budget allows (every one, where there are no
  //  frames to spread them over), the camera on the square the map is centred on, and the scene drawn. Another frame
  //  is asked for while chunks wait.
  #frameDrawn(budget: number | null): void {
    const started = performance.now(),
      moving = this.#moveCamera(started),
      [u, v] = this.#focus();

    this.#takeTiles();

    // Centred elsewhere since: the chunks nearest the new centre are built first.
    if (`${u},${v}` !== this.#focused) {
      this.#focused = `${u},${v}`;
      this.#land.refocus(u, v);
    }

    this.#land.build(this.#stage, budget);

    const rising = this.#followHeight(budget !== null);

    this.#stage.view(this.#orbit, this.#lookHeight ?? 0);
    this.#stage.render();
    this.#keepDistance();
    this.#frameTime = performance.now() - started;
    this.#showStats();

    if (this.#land.pending() > 0 || moving || rising) {
      this.#draw();
    }
  }

  // The camera's distance kept, once a frame at most, when it's changed: not mid-glide, which only passes through.
  #keepDistance(): void {
    const { distance } = this.#orbit;

    if (this.#glide !== null || distance === this.#keptDistance) {
      return;
    }

    this.#keptDistance = distance;
    this.#distance.set(distance);
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
    // What floats over the map sits elsewhere over it now.
    this.measureCovered();
    this.#stage.render();
  }
}

export default MapView3D;
