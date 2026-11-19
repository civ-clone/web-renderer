// The 3D map (`MapRenderer`, docs/3d-renderer.md §2.1), behind `?3d=1` until it shows everything the 2D map does (§11).
//
// It shows the land (slice 1.1), its relief and its terrain's colours, built a few chunks a frame from where the map is
//  centred, and again where tile patches change it. The camera (slice 1.2) orbits a point on the ground: centring the
//  map glides it there (at once the first time), the keys turn it and zoom it, the mouse, the wheel and touch move it,
//  and its distance is kept as the 2D map's zoom is. Cities and units are marked on the land (1.3), a click, a press
//  held and a right-click do what they do on the 2D map, and the minimap shows its own overview (1.5). Still to come:
//  hovering's tooltips, waiting's cursor, and units moving and fighting (M2).
//
// Reaches beyond its canvas where the 2D map does: the `window` `resize` handler and an observer of the canvas's
//  parent, which size the canvas to it, and the minimap's canvas, which it draws its overview on.

import { Coordinate, Tile, Unit } from '@civ-clone/ui-protocol/types';
import { MapEvent } from '@civ-clone/ui-protocol/mapEvents';
import { MapView3DDeps } from '@civ-clone/ui-map/MapView3DFactory';
import MapPortal3D from './MapPortal3D';
import MapRenderer from '@civ-clone/ui-map/MapRenderer';
import type { MapHeading } from '@civ-clone/ui-client/lib/unitActionKeys';
import groundDirections from './layouts/directions';
import World from '@civ-clone/ui-map/components/World';
import { Stage, StageFactory, createStage } from './stage';
import Land from './Land';
import {
  Orbit,
  TURN_STEP,
  between,
  clampOrbit,
  defaultOrbit,
  groundAt,
  settled,
  sightFor,
  toScreen,
  zoomed,
} from './camera/orbit';
import prefersReducedMotion from '@civ-clone/ui-map/lib/reducedMotion';
import CameraInput from './camera/CameraInput';
import markerFor, { MarkerWords } from './markers/markerFor';
import pickGround from './camera/pick';
import Minimap3D from './minimap/Minimap3D';
import { LaidYields, innerOf, laidYields, yieldMesh } from './yields';
import { squareCity, squareYields } from '@civ-clone/ui-client/lib/yieldMap';

// How long, in ms, each frame may go on building the land's chunks while any wait. A chunk is built whole, once a frame
//  has begun one: one takes 17–25 ms, so a frame builds one, and more only where they're quicker.
const BUILD_BUDGET = 10;

// How many units' facings are kept at most.
const FACINGS_KEPT = 4000;

// `delta` radians taken the short way round: between half a turn either way.
const shortTurn = (delta: number): number =>
  delta - Math.PI * 2 * Math.round(delta / (Math.PI * 2));

// How long the camera takes to glide to a square it's centred on, or to turn, in ms.
const GLIDE = 350;

// How long the camera's distance stays the same before it's kept, in ms: a pinch or a zoom changes it every frame.
const KEEP_DISTANCE_AFTER = 500;

// How much of the way to the land's height under the focus the camera rises or falls each frame, so it doesn't jolt
//  over every hill as it moves.
const HEIGHT_EASE = 0.25;

// How long the mouse rests on a square before its tooltip opens, as on the 2D map.
const HOVER_DELAY = 400;

// The square the mouse rests on: where the mouse is on the page, the timer before its tooltip opens, and whether it has.
type Hover = {
  key: string;
  x: number;
  y: number;
  // Where the mouse is on the canvas, and on the page.
  canvasX: number;
  canvasY: number;
  clientX: number;
  clientY: number;
  timer: number | null;
  open: boolean;
};

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
  // A glide: where from and to, when it started, how far it turns, as asked, the way asked, and how much of the way
  //  the camera was last drawn, eased.
  #glide: {
    from: Orbit;
    to: Orbit;
    started: number | null;
    turn: number;
    drawn: number;
  } | null = null;
  #lookHeight: number | null = null;
  // The mouse, the wheel and touch moving the camera; and where its distance is kept, and what was kept last.
  #input: CameraInput;
  #distance: MapView3DDeps['cameraDistance'];
  #keptDistance: number;
  // The wait to keep a distance, and the distance it's waiting to keep.
  #keeping: ReturnType<typeof setTimeout> | null = null;
  #waitingToKeep: number | null = null;
  // Whether the camera stops at the poles, as it starts: the portal's after that, which the options can change.
  #lockAtStart: boolean;
  // Whether the camera has been centred on anything yet: the first time, it's put there at once.
  #centred = false;
  // What a square does when clicked or held, the page's; and a square being chosen for a long-range order, if one is.
  #squares: MapView3DDeps['squares'];
  // How the page words markers: cities' names, and busy units' letters.
  #words: MarkerWords;
  // Which way each unit faces, by its id: the way the map events last saw it move, or attack.
  #facings = new Map<string, number>();
  // Units that have moved, by their id: where they were drawn as they set off, and the square they're bound for (`x,y`).
  //  The patch that draws them there has them slide from where they set off, if they're on top there. Kept a moment
  //  only, for a patch that doesn't come.
  #slides = new Map<
    string,
    { from: [number, number, number]; to: string; until: number }
  >();
  #transport: MapView3DDeps['transport'];
  #picking: Picking | null = null;
  // The square the mouse rests on, waiting to show its tooltip or showing it, and whose tooltips they'd be.
  #hover: Hover | null = null;
  #playerId: string;
  #endHover = (): void => {
    const hover = this.#hover;

    if (hover === null) {
      return;
    }

    if (hover.timer !== null) {
      window.clearTimeout(hover.timer);
    }

    this.#hover = null;
    document.removeEventListener('keydown', this.#endHover, true);

    if (hover.open) {
      this.#squares.endTooltip(this.#canvas);
    }
  };
  // The minimap's overview, if there's a minimap, and whether the squares have changed since it was drawn.
  #minimap: Minimap3D | null = null;
  #minimapStale = true;
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
  // How big units are drawn, as the player chose (1 is life size), and what stops a change to it being told.
  #unitSize: number;
  #stopUnitSize: () => void = (): void => {};
  #yieldsShown = false;
  // Whether the yields drawn are out of date (`#showYields`), and whether any are drawn.
  #yieldsStale = true;
  #yieldsDrawn = false;
  // Each square's yields laid out, by `x,y`, or nothing where it yields nothing, and the yields they're of: kept until
  //  its land changes or it yields something else (its city's figures, which change with the city).
  #yieldsLaid = new Map<
    string,
    { of: readonly unknown[]; laid: LaidYields | null }
  >();
  // How wide a circle fits inside a square, in the world's units: what a square's yields are fitted in.
  #inner: number;
  // What stops the page telling of its art changing, which the yields' icons are drawn from.
  #stopArtChanged: () => void = (): void => {};
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
    this.#words = { cityName: deps.cityName, unitStatus: deps.unitStatus };
    this.#unitSize = deps.unitSize?.get() ?? 1;
    this.#artId = deps.art.id();
    this.world = deps.world;
    this.#land = new Land(deps.world);
    this.#inner = innerOf(this.#land.layout, deps.world.topology());
    // Read just now, by the land.
    this.#worldTiles = deps.world.tiles();
    this.#worldTileCount = this.#worldTiles.length;
    this.#distance = deps.cameraDistance;
    this.#lockAtStart = deps.lockVerticalEdges;

    const kept = deps.cameraDistance.get();

    // The distance the player last chose, kept within the camera's range; and kept as it is, so it's saved again only
    //  once the player changes it.
    this.#orbit = this.#settle({
      ...defaultOrbit(this.#land.layout.centre(0, 0)),
      ...(kept === null ? {} : { distance: kept }),
    });
    this.#keptDistance = this.#orbit.distance;
    this.portal = new MapPortal3D(deps, {
      centre: () => this.#centreSquare(),
      centreOn: (x, y) => this.#centreOn(x, y),
      changed: () => this.#draw(),
      visible: (x, y, margin) => this.#visible(x, y, margin),
    });

    this.#stage = stageFactory(deps.mapCanvas, {
      period: this.#land.layout.period(),
      ground: this.#land.ground(),
      yieldIcon: deps.yieldIcon,
    });

    // After the stage: one that can't be made leaves no minimap behind it.
    if (deps.minimapCanvas !== null) {
      this.#minimap = new Minimap3D(
        deps.minimapCanvas,
        this.#land.layout,
        deps.world,
        this.#land.extentV(),
        (u, v) =>
          this.#moveTo({ ...(this.#glide?.to ?? this.#orbit), focus: [u, v] })
      );
    }

    if (deps.debug && deps.mapCanvas.parentElement) {
      this.#stats = this.#statsOverlay(deps.mapCanvas.parentElement);
      // For the console, as `?debug=1` tooling is.
      (window as unknown as { civMap3DView?: MapView3D }).civMap3DView = this;
    }

    this.#land.queueAll(...this.#focus());
    this.#markAll();

    this.portal.on('activate-unit', (unit) => deps.activateUnit(unit));

    this.#squares = deps.squares;
    this.#playerId = deps.playerId;
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
        menuOpen: () => this.#squares.menuOpen(),
        hover: (at) => this.#hovered(at),
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

    // Last, once the map's made: one that can't be leaves nothing listening to Options. Each marker drawn again at the
    //  size chosen, as Options changes it.
    this.#stopUnitSize =
      deps.unitSize?.onChange((): void => {
        const size = deps.unitSize?.get() ?? 1;

        if (size !== this.#unitSize && !this.#disposed) {
          this.#unitSize = size;
          this.#markAll();
          this.#draw();
        }
      }) ?? ((): void => {});
    // And the yields' icons drawn again from the page's art when it changes.
    this.#stopArtChanged =
      deps.artChanged?.((): void => {
        if (!this.#disposed) {
          this.#yieldsStale = true;
          this.#draw();
        }
      }) ?? ((): void => {});
  }

  /** The land, for the `?debug=1` console. */
  land(): Land {
    return this.#land;
  }

  /** The camera now, for the `?debug=1` console and the tests. */
  orbit(): Orbit {
    return this.#orbit;
  }

  /**
   * Whether the camera's on its way somewhere: gliding to a square, or being dragged, pinched or flicked. The debug page
   *  follows it once it's still.
   */
  moving(): boolean {
    return this.#glide !== null || this.#input.moving();
  }

  /** The camera put where it's asked, at once, for the `?debug=1` console. */
  setOrbit(orbit: Orbit): void {
    this.#endHover();
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

  /**
   * Turns the view `steps` eighths of a turn: clockwise seen from above, or the other way for fewer than none. Pressed
   *  again before it's done, it turns on the same way, however far: never back the short way round.
   */
  turnBy(steps: number): void {
    const target = this.#glide?.to ?? this.#orbit;

    this.#moveTo(
      { ...target, yaw: target.yaw + steps * TURN_STEP },
      this.#turnLeft() + steps * TURN_STEP
    );
  }

  /**
   * How the camera's turned, for the keys that move a unit: the way it's turning to, mid-turn, and the way each of the
   *  grid's directions points on the ground, from a square to its neighbour, as the land's laid out.
   */
  heading(): MapHeading {
    return {
      turn: (this.#glide?.to ?? this.#orbit).yaw,
      directions: groundDirections(this.#land.layout, this.world.topology()),
    };
  }

  /** Turns the view to look north, the short way round from where it faces now. */
  faceNorth(): void {
    this.#moveTo(
      { ...(this.#glide?.to ?? this.#orbit), yaw: 0 },
      shortTurn(-this.#orbit.yaw)
    );
  }

  // What's still to turn of the glide under way, the way it was asked, from the camera as it was last drawn, which a
  //  new glide starts from: none without one. Not from the yaw drawn, which is kept within a turn.
  #turnLeft(): number {
    const glide = this.#glide;

    return glide === null ? 0 : glide.turn * (1 - glide.drawn);
  }

  /** Nothing to flip yet: the stress runner's view modes are the 2D map's layers. */
  debugViewModes(): (() => void)[] {
    return [];
  }

  dispose(): void {
    this.#keepDistance(true);
    this.#disposed = true;
    this.#stopUnitSize();
    this.#stopArtChanged();
    this.#endHover();
    this.#input.dispose();
    this.#minimap?.dispose();
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

  /**
   * A unit moved, or fought: it faces the way it went, or the way it attacked, and a defender faces its attacker. The
   *  patch that follows a move draws it on its new square, where it slides in from where it set off.
   */
  mapEvent(event: MapEvent): void {
    if (event.kind === 'moved') {
      this.#setOff(event.unit.id, event.from, event.to);
      this.#face(event.unit.id, event.from, event.to);

      return;
    }

    this.#face(event.attacker.id, event.attacker.tile, event.defender.tile);
    this.#face(event.defender.id, event.defender.tile, event.attacker.tile);
  }

  // The unit `id` sets off from the square `from` for `to`: where it's drawn now, sliding there still or standing on its
  //  square, taken to the copy of the world nearest `to`, so it slides the short way. Moving on again before it's been
  //  drawn on the square it was bound for, it sets off from where it's still drawn. Not where there are no frames to
  //  slide over, or the player has asked for less motion.
  #setOff(id: string, from: Coordinate, to: Coordinate): void {
    const now = performance.now(),
      pending = this.#slides.get(id);

    this.#slides.forEach(({ until }, unit) => {
      if (until < now) {
        this.#slides.delete(unit);
      }
    });

    if (typeof requestAnimationFrame !== 'function' || prefersReducedMotion()) {
      return;
    }

    const [fromU, fromV] = this.#land.layout.centre(from.x, from.y),
      [toU, toV] = this.#land.layout.centre(to.x, to.y),
      { u: periodU, v: periodV } = this.#land.layout.period(),
      short = (delta: number, period: number | null): number =>
        period === null ? delta : delta - period * Math.round(delta / period),
      [drawnU, drawnY, drawnV] = (pending !== undefined && pending.until >= now
        ? pending.from
        : null) ??
        this.#stage.markerAt(`${from.x},${from.y}`, id) ?? [
          fromU,
          Math.max(0, this.#land.surfaceAt(fromU, fromV)),
          fromV,
        ];

    this.#slides.set(id, {
      from: [
        toU + short(drawnU - toU, periodU),
        drawnY,
        toV + short(drawnV - toV, periodV),
      ],
      to: `${to.x},${to.y}`,
      until: now + 2000,
    });
  }

  // The unit `id` faces from the square `from` towards `to`, the short way round the world, and is marked again.
  #face(id: string, from: Coordinate, to: Coordinate): void {
    const [fromU, fromV] = this.#land.layout.centre(from.x, from.y),
      [toU, toV] = this.#land.layout.centre(to.x, to.y),
      { u: periodU, v: periodV } = this.#land.layout.period(),
      short = (delta: number, period: number | null): number =>
        period === null ? delta : delta - period * Math.round(delta / period),
      du = short(toU - fromU, periodU),
      dv = short(toV - fromV, periodV);

    if (du === 0 && dv === 0) {
      return;
    }

    // Rounded, so a marker's drawn again only for a turn that shows. The longest unseen to move let go, past a few
    //  thousand: units die, and their ids aren't seen again.
    this.#facings.delete(id);
    this.#facings.set(id, Math.round(Math.atan2(du, dv) * 1000) / 1000);

    if (this.#facings.size > FACINGS_KEPT) {
      this.#facings.delete(this.#facings.keys().next().value!);
    }
    [from, to].forEach(({ x, y }) => this.#mark(x, y));
    this.#draw();
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
    // The yields' icons are the map's pack's own, where it has them.
    this.#yieldsStale = true;

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

  /** While the other players move, no tooltip opens, and any open one goes, as on the 2D map. */
  setWaiting(waiting: boolean): void {
    this.#waiting = waiting;

    if (waiting) {
      this.#endHover();
    }
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

  /** Shows or hides what each square yields (`y`), over the squares in the world. */
  toggleYields(): void {
    this.#yieldsShown = !this.#yieldsShown;
    this.#yieldsStale = true;
    this.#draw();
  }

  /** Brings the camera `steps` nearer, or further away for fewer than none, about the point it looks at. */
  zoomBy(steps: number): void {
    this.#endHover();
    this.#orbit = zoomed(this.#orbit, steps);

    // Both ends of a glide, so it carries on at the new distance rather than easing back to the old one.
    if (this.#glide !== null) {
      this.#glide.from = zoomed(this.#glide.from, steps);
      this.#glide.to = zoomed(this.#glide.to, steps);
    }

    this.#draw();
  }

  // Whether the square at (`x`, `y`) is on the screen: its middle, at its copy nearest the camera, `margin` squares and
  //  half a square in from the screen's edges, as big as a square is there, and not under what floats over the map.
  //  Mid-glide, where the camera's going: the game asks so as to know whether to move it there again.
  #visible(x: number, y: number, margin: number): boolean {
    const width = this.#canvas.clientWidth,
      height = this.#canvas.clientHeight;

    // Not laid out yet: nothing can be seen.
    if (width <= 0 || height <= 0) {
      return false;
    }

    const orbit = this.#glide?.to ?? this.#orbit,
      [u, v] = this.#land.layout.centre(x, y),
      { u: periodU, v: periodV } = this.#period(),
      [focusU, focusV] = orbit.focus,
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
      middle = toScreen(orbit, look, at, aspect),
      // A square's width there, along the screen.
      beside = toScreen(
        orbit,
        look,
        [at[0] + Math.cos(orbit.yaw), at[1], at[2] + Math.sin(orbit.yaw)],
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
      wrapsY = this.#period().v !== null;

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

  // The mouse rests at a point on the canvas, or has left it (`null`): the square under it's tooltip opens after a moment,
  //  if the interface has one for it. Not while the other players move, or over a menu.
  #hovered(
    at: { x: number; y: number; clientX: number; clientY: number } | null
  ): void {
    const tile =
        at === null || this.#waiting || this.#squares.menuOpen()
          ? null
          : this.#tileAt(at.x, at.y),
      current = this.#hover;

    if (tile === null || at === null) {
      this.#endHover();

      return;
    }

    const key = `${tile.x},${tile.y}`;

    // Still the same square: wait on, or leave it open.
    if (current !== null && current.key === key) {
      Object.assign(current, {
        canvasX: at.x,
        canvasY: at.y,
        clientX: at.clientX,
        clientY: at.clientY,
      });

      return;
    }

    this.#endHover();

    const hover: Hover = {
      key,
      x: tile.x,
      y: tile.y,
      canvasX: at.x,
      canvasY: at.y,
      clientX: at.clientX,
      clientY: at.clientY,
      timer: null,
      open: false,
    };

    hover.timer = window.setTimeout(() => {
      hover.timer = null;
      this.#showHover(hover);
    }, HOVER_DELAY);
    this.#hover = hover;

    // A key, while it waits or once it's open: it may move the map, or open a window over it.
    document.addEventListener('keydown', this.#endHover, true);
  }

  // The tooltip for the square the mouse rests on, as it is now, over the mouse: or none, if a window has opened over
  //  the map since, or the square under the mouse is another now, or it has nothing to say any more.
  #showHover(hover: Hover): void {
    const over =
        typeof document.elementFromPoint !== 'function' ||
        document.elementFromPoint(hover.clientX, hover.clientY) ===
          this.#canvas,
      under = over ? this.#tileAt(hover.canvasX, hover.canvasY) : null;

    if (under === null || `${under.x},${under.y}` !== hover.key) {
      this.#endHover();

      return;
    }

    const opened = this.#squares.tooltip(this.#canvas, under, this.#playerId, {
      left: hover.clientX - 10,
      top: hover.clientY - 10,
      bottom: hover.clientY + 10,
    });

    // Open before, with nothing to say now: it goes.
    if (!opened && hover.open) {
      this.#squares.endTooltip(this.#canvas);
    }

    hover.open = opened;
  }

  // The point on the ground the camera looks at.
  #focus(): [number, number] {
    return [...this.#orbit.focus];
  }

  // The square the camera looks at, on the world: past a pole the camera stops at, the row at that pole, not the far
  //  one's.
  #centreSquare(): Coordinate {
    const [x, y] = this.#land.layout.tileAt(...this.#orbit.focus),
      width = this.world.width(),
      height = this.world.height();

    return {
      x: ((x % width) + width) % width,
      y:
        this.#period().v === null
          ? Math.min(height - 1, Math.max(0, y))
          : ((y % height) + height) % height,
    };
  }

  // Glides the camera to look at the middle of the square at (`x`, `y`), unless it's there already.
  #centreOn(x: number, y: number): void {
    const [u, v] = this.#land.layout.centre(x, y),
      [toU, toV] = (this.#glide?.to ?? this.#orbit).focus;

    if (u === toU && v === toV) {
      return;
    }

    const target: Orbit = {
        ...(this.#glide?.to ?? this.#orbit),
        focus: [u, v],
      },
      { u: periodU, v: periodV } = this.#period(),
      short = (delta: number, period: number | null): number =>
        period === null ? delta : delta - period * Math.round(delta / period),
      [fromU, fromV] = this.#orbit.focus,
      away = Math.hypot(short(u - fromU, periodU), short(v - fromV, periodV));

    // The first time, as a game starts or loads, and anywhere further than the camera sees round its focus: there at
    //  once, rather than gliding over the world.
    if (!this.#centred || away > this.#orbit.distance * 1.5) {
      this.#centred = true;
      this.setOrbit(target);

      return;
    }

    this.#moveTo(target);
  }

  // The camera kept on the world, round its period, or within its rows where it doesn't wrap over the poles or the
  //  player stops it at them; and its pitch and distance within their ranges.
  #settle(orbit: Orbit): Orbit {
    return settled(clampOrbit(orbit), this.#period(), this.#land.extentV());
  }

  // How far along the world repeats as the camera goes round it: across, and down unless it doesn't wrap over the poles
  //  or the player stops the camera at them (`lockVerticalEdges`).
  #period(): { u: number; v: number | null } {
    const period = this.#land.layout.period(),
      // Before the portal's made, as the view starts, as it started.
      locked = this.portal?.lockVerticalEdges() ?? this.#lockAtStart;

    return locked ? { u: period.u, v: null } : period;
  }

  // The camera glides to `target`, turning by `turn` on the way (by default, what's left of a turn under way, then the
  //  short way to `target`'s yaw), or is put there at once where there are no frames to glide over, or the player has
  //  asked for less motion.
  #moveTo(
    target: Orbit,
    turn = this.#turnLeft() +
      shortTurn(target.yaw - (this.#glide?.to ?? this.#orbit).yaw)
  ): void {
    // The square under the mouse is about to move away.
    this.#endHover();

    if (typeof requestAnimationFrame !== 'function' || prefersReducedMotion()) {
      this.#glide = null;
      this.#orbit = this.#settle(target);
    } else {
      this.#glide = {
        from: this.#orbit,
        to: target,
        started: null,
        turn,
        drawn: 0,
      };
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

    glide.drawn = t * t * (3 - 2 * t);
    this.#orbit = this.#settle(
      between(glide.from, glide.to, t, this.#period(), glide.turn)
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
    const reshaped = this.#land.changed(squares, ...this.#focus(), replaced);

    squares.forEach(([x, y]) => this.#mark(x, y));
    this.#yieldsChanged(squares, reshaped);

    // The square an open tooltip is about has changed: it says what's there now.
    const hover = this.#hover;

    if (
      hover !== null &&
      hover.open &&
      squares.some(([x, y]) => x === hover.x && y === hover.y)
    ) {
      this.#showHover(hover);
    }

    if (squares.length > 0 || replaced) {
      this.#minimapStale = true;
    }

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
        this.#unitsShown,
        this.#words,
        (unit) => this.#facings.get(unit.id) ?? 0,
        this.#unitSize
      );

    // On the land as it's drawn, as what's laid on it is, so a unit's stand stands over that.
    const [u, v] = this.#land.layout.centre(x, y),
      at: [number, number, number] = [
        u,
        Math.max(0, this.#land.surfaceAt(u, v)),
        v,
      ],
      signature = marker === null ? null : JSON.stringify([marker, at]);

    const changed = signature !== (this.#marked.get(key) ?? null);

    if (changed) {
      this.#stage.setMarker(key, at, marker);
    }

    // Units bound here that have arrived: the one on top slides from where it set off, if it's drawn anew; one under
    //  another doesn't, nor one not shown (units hidden), and none of them will later. One that's taken too long to
    //  arrive doesn't either. Most squares are marked with no unit moving at all.
    if (this.#slides.size === 0) {
      if (changed) {
        this.#remember(key, signature);
      }

      return;
    }

    const now = performance.now(),
      here = new Set(
        (this.world.get(x, y)?.units ?? []).map((unit) => unit.id)
      );

    this.#slides.forEach((slide, id) => {
      if (slide.until < now) {
        this.#slides.delete(id);

        return;
      }

      if (slide.to !== key || !here.has(id)) {
        return;
      }

      this.#slides.delete(id);

      if (changed && marker?.unit?.id === id) {
        this.#stage.slideMarker(key, slide.from);
      }
    });

    if (changed) {
      this.#remember(key, signature);
    }
  }

  // Squares that changed (`squares`), their yields laid out again; and those whose land did (`reshaped`, which a world
  //  replaced, by a square newly seen, say, may add to), with their neighbours', whose land meets theirs and so may
  //  stand higher or lower. A tile replaced with yields of its own is told by them (`#showYields`).
  #yieldsChanged(
    squares: readonly (readonly [number, number])[],
    reshaped: readonly (readonly [number, number])[]
  ): void {
    if (squares.length === 0 && reshaped.length === 0) {
      return;
    }

    const topology = this.world.topology();

    squares.forEach(([x, y]) => this.#yieldsLaid.delete(`${x},${y}`));
    reshaped.forEach(([x, y]) => {
      this.#yieldsLaid.delete(`${x},${y}`);
      topology.directions().forEach((direction) => {
        const next = topology.neighbour(x, y, direction);

        if (next !== null) {
          this.#yieldsLaid.delete(`${next[0]},${next[1]}`);
        }
      });
    });
    this.#yieldsStale = true;
  }

  // What each square yields, drawn again on the stage if it's out of date and shown, and taken away once it's hidden.
  #showYields(): void {
    if (!this.#yieldsShown) {
      if (this.#yieldsDrawn) {
        this.#stage.setYields(null);
        this.#yieldsDrawn = false;
      }

      return;
    }

    if (!this.#yieldsStale && this.#yieldsDrawn) {
      return;
    }

    const squares: LaidYields[] = [];

    this.world.tiles().forEach((tile) => {
      const key = `${tile.x},${tile.y}`,
        yields = squareYields(tile, squareCity(tile));
      let kept = this.#yieldsLaid.get(key);

      if (kept === undefined || kept.of !== yields) {
        const [u, v] = this.#land.layout.centre(tile.x, tile.y);

        // On the land as it's drawn, as markers stand, and on the sea where it's lower.
        kept = {
          of: yields,
          laid:
            yields.length === 0
              ? null
              : laidYields(
                  {
                    at: [u, Math.max(0, this.#land.surfaceAt(u, v)), v],
                    yields,
                  },
                  this.#inner
                ),
        };
        this.#yieldsLaid.set(key, kept);
      }

      if (kept.laid !== null) {
        squares.push(kept.laid);
      }
    });

    this.#stage.setYields(yieldMesh(squares));
    this.#yieldsStale = false;
    this.#yieldsDrawn = true;
  }

  // What's marked on the square `key` now, to tell when it changes.
  #remember(key: string, signature: string | null): void {
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

    this.#showYields();
    this.#stage.view(this.#orbit, this.#lookHeight ?? 0, this.#period());
    this.#stage.render();
    this.#showMinimap();
    this.#keepDistance();
    this.#frameTime = performance.now() - started;
    this.#showStats();

    if (
      this.#land.pending() > 0 ||
      this.#land.overlaysPending() > 0 ||
      this.#stage.sliding() ||
      moving ||
      rising
    ) {
      this.#draw();
    }
  }

  // The minimap: its overview drawn again if the squares have changed, and the ground the camera sees over it.
  #showMinimap(): void {
    const minimap = this.#minimap;

    if (minimap === null) {
      return;
    }

    if (this.#minimapStale) {
      this.#minimapStale = false;
      minimap.redraw();
    }

    const active = this.#activeUnit?.tile ?? null;

    minimap.show(
      this.#patch(),
      active === null ? null : { x: active.x, y: active.y }
    );
  }

  // The ground the camera sees, as the corners of the screen meet it, at the height it looks at: where a corner is
  //  above the horizon, as far as the haze lets it see along that edge.
  #patch(): [number, number][] | null {
    const width = this.#canvas.clientWidth,
      height = this.#canvas.clientHeight;

    if (width <= 0 || height <= 0) {
      return null;
    }

    const aspect = width / height,
      look = this.#lookHeight ?? 0,
      far = sightFor(this.#orbit.distance).far,
      [focusU, focusV] = this.#orbit.focus,
      corner = (x: number, y: number): [number, number] | null => {
        // Down the edge from the corner until it meets the ground.
        for (let along = y; along >= -1; along -= 0.05) {
          const ground = groundAt(this.#orbit, look, [x, along], aspect);

          if (ground !== null) {
            const reach = Math.hypot(ground[0] - focusU, ground[1] - focusV),
              cut = reach > far ? far / reach : 1;

            return [
              focusU + (ground[0] - focusU) * cut,
              focusV + (ground[1] - focusV) * cut,
            ];
          }
        }

        return null;
      },
      corners = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];

    return corners.every((point) => point !== null)
      ? (corners as [number, number][])
      : null;
  }

  // The camera's distance kept when it's changed, once it's stayed the same for a moment: not mid-glide, which only
  //  passes through, nor every frame of a pinch or a zoom. Taken down, the distance it was at or gliding to is kept at
  //  once.
  #keepDistance(now = false): void {
    const distance = (now ? this.#glide?.to ?? this.#orbit : this.#orbit)
        .distance,
      stop = (): void => {
        if (this.#keeping !== null) {
          clearTimeout(this.#keeping);
        }

        this.#keeping = null;
        this.#waitingToKeep = null;
      },
      keep = (): void => {
        stop();
        this.#keptDistance = distance;
        this.#distance.set(distance);
      };

    if (now) {
      stop();

      if (distance !== this.#keptDistance) {
        keep();
      }

      return;
    }

    if (this.#glide !== null || distance === this.#keptDistance) {
      stop();

      return;
    }

    // Already waiting to keep this one: frames drawn meanwhile don't put it off.
    if (this.#keeping !== null && distance === this.#waitingToKeep) {
      return;
    }

    stop();
    this.#waitingToKeep = distance;
    this.#keeping = setTimeout(keep, KEEP_DISTANCE_AFTER);
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
