// The 3D map (`MapRenderer`, docs/3d-renderer.md §2.1), behind `?3d=1` until it shows everything the 2D map does (§11).
//
// It shows the land (slice 1.1), its relief and its terrain's colours, built a few chunks a frame from where the map is
//  centred, and again where tile patches change it. The camera (slice 1.2) orbits a point on the ground: centring the
//  map glides it there (at once the first time), the keys turn it and zoom it, the mouse, the wheel and touch move it,
//  and its distance is kept as the 2D map's zoom is. Cities and units are marked on the land (1.3), a click, a press
//  held and a right-click do what they do on the 2D map, and the minimap shows its own overview (1.5). Units walk from
//  square to square as the map's events say they've moved (2.3, `walks.ts`). Still to come: waiting's cursor, and
//  units fighting (2.4).
//
// Reaches beyond its canvas where the 2D map does: the `window` `resize` handler and an observer of the canvas's
//  parent, which size the canvas to it, and the minimap's canvas, which it draws its overview on.

import { Coordinate, Tile, Unit } from '@civ-clone/ui-protocol/types';
import { MapEvent, MapEventUnit } from '@civ-clone/ui-protocol/mapEvents';
import {
  CityBannerImage,
  MapView3DDeps,
} from '@civ-clone/ui-map/MapView3DFactory';
import MapPortal3D from './MapPortal3D';
import MapRenderer from '@civ-clone/ui-map/MapRenderer';
import type { MapHeading } from '@civ-clone/ui-client/lib/unitActionKeys';
import groundDirections from './layouts/directions';
import World from '@civ-clone/ui-map/components/World';
import { FLASH_SIZE, Stage, StageFactory, createStage } from './stage';
import { ClipRole, ShotKind } from './models/modelSet';
import { RigFacts, STRIDE } from './markers/clips';
import {
  HIT_PUFF,
  MUZZLE_PUFF,
  SHOT_LOOKS,
  SHOT_TARGET,
  ShotTime,
  landsAt,
  shotAt,
  shotHeading,
  shotTimes,
  shotsFired,
} from './shots';
import Land from './Land';
import {
  Orbit,
  TURN_STEP,
  between,
  clampOrbit,
  defaultOrbit,
  groundAt,
  lowestPitch,
  settled,
  sightFor,
  toScreen,
  zoomed,
} from './camera/orbit';
import prefersReducedMotion from '@civ-clone/ui-map/lib/reducedMotion';
import CameraInput from './camera/CameraInput';
import markerFor, { MarkerWords, TileMarker } from './markers/markerFor';
import { IN_FRONT_OF_CITY, UNIT_SCALE } from './markers/drawMarker';
import { airborne, unitLook } from '@civ-clone/ui-models-builtin/units';
import Walks, {
  OWN_PACE,
  RIVALS_PACE,
  WalkPoint,
  Walker,
  quicker,
} from './walks';
import Fades, { FADE } from './fades';
import Wakes, { wakeShape } from './wakes';
import Battles, {
  BATTLE_PACE,
  Battle,
  Fighter,
  REACH,
  battleLength,
  clipPace,
  quickerBattle,
} from './battles';
import pickGround from './camera/pick';
import Minimap3D from './minimap/Minimap3D';
import { LaidYields, innerOf, laidYields, yieldMesh } from './yields';
import { BannerSite, bannerPlaces } from './banners';
import idleSquares, { IDLE_FRAME } from './idling';
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

// How far behind a unit's battles may fall before those under way are over at once, as the spec has the queue (§8.2),
//  or, where a battle takes longer, its fighters playing their clips, two of the longest: the new one, or one it's in.
const BATTLES_BEHIND = 2000;

// The most units that may start fading in or out as one batch of tiles is taken: past that, as when a turn's handed over
//  or a whole stretch of the map comes into sight, they come and go at once.
const FADES_AT_ONCE = 8;

// A unit as it's shown, kept: the page fills the objects it holds in place as patches come, so what a marker shows of it
//  is copied, its hit points and all.
const keptUnit = (unit: Unit): Unit => ({
  ...unit,
  ...(unit.hitPoints ? { hitPoints: { ...unit.hitPoints } } : {}),
  ...(unit.defence ? { defence: { ...unit.defence } } : {}),
  ...(unit.improvements ? { improvements: [...unit.improvements] } : {}),
});

// An object the page fills in place as patches come, copied a level down: its own values, and theirs.
const copied = <T extends object>(object: T): T =>
  Object.fromEntries(
    Object.entries(object).map(([name, value]) => [
      name,
      Array.isArray(value)
        ? [...value]
        : value !== null && typeof value === 'object'
        ? { ...value }
        : value,
    ])
  ) as T;

/**
 * A city as it's shown, kept, as `keptUnit` keeps a unit: what its marker and its banner show of it (its size, what it's
 *  building and how far, how it grows, what it yields), so a patch filling the page's objects in place leaves it as it
 *  was. Its players, whose objects reach round to the city itself, are shared.
 */
export const keptCity = (city: Tile['city']): Tile['city'] =>
  city
    ? {
        ...city,
        ...(city.growth ? { growth: copied(city.growth) } : {}),
        ...(city.build ? { build: copied(city.build) } : {}),
        ...(city.yields
          ? { yields: city.yields.map((each) => ({ ...each })) }
          : {}),
      }
    : city;

// How long the camera's distance stays the same before it's kept, in ms: a pinch or a zoom changes it every frame.
const KEEP_DISTANCE_AFTER = 500;

// How much of the way to the land's height under the focus the camera rises or falls each frame, so it doesn't jolt
//  over every hill as it moves.
const HEIGHT_EASE = 0.25;

// How long the mouse rests on a square before its tooltip opens, as on the 2D map.
const HOVER_DELAY = 400;

// How clear of the haze a city's banner is to take clicks and the mouse resting on it, from 1 short of the haze to 0
//  where it hides the land: one fainter lets them through to the land, faded as it is.
const BANNER_TAKES_POINTER = 0.5;

// What was on a square attacked as a battle there came (`MapView3D#fight`): its city and units, and whether the
//  battle's patch has been released for it since, the page's world as it is after the battle there.
type Before = {
  square: string;
  city: Tile['city'];
  units: Unit[];
  // The battle's own: when it came, by the tiles queued (`#queued`), whether the attacker won, and the defender.
  after: number;
  won: boolean;
  defender: string;
  patched: boolean;
};

// What a square's marked with, for telling which units come and go (`MapView3D#fadeChanged`): its units, kept as they
//  were drawn, as the page fills what it holds in place; the one shown on top, if any's shown; and whether it stood in
//  front of a city there.
type Marked = {
  units: Unit[];
  shown: string | null;
  ringed: boolean;
  inCity: boolean;
};

// What the mouse rests on (a square, or a city's banner, `key`, with its city's square): where the mouse is on the
//  page, the timer before its tooltip opens, and whether it has.
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
  // The units walking from square to square (`walks.ts`), each walk drawn as a walker of its own, its units left off
  //  the squares they're on until it's over.
  #walks: Walks;
  // Each unit walking: as the page has it, to draw it from; and the squares marked without it since, to mark again with
  //  it once it's there.
  #walkingUnits = new Map<string, Unit>();
  #heldFor = new Map<string, Set<string>>();
  // What each walker was last drawn as.
  #walkersDrawn = new Map<string, string>();
  // How far each walker's gone, by its id, and where it was last drawn: its figures' legs keep up (`STRIDE`).
  #walked = new Map<string, { at: [number, number]; by: number }>();
  // Walks over before the patch for their units' last step has come, as when meeting a leader holds the patches: each
  //  stands where it ended, its units still left off their squares, until it comes. By its id, with the units it has.
  #unpatched = new Map<string, Walker>();
  #unpatchedUnits = new Set<string>();
  // The squares of each walking unit's last step (`x,y`), and the last tile queued before it, until a tile for either of
  //  them queued since has come: that step's patch, as the worker sends both squares of every move the player's view
  //  knows, just after the step. Tiles queued before it, for the step before, say, are not.
  #awaiting = new Map<string, { squares: [string, string]; after: number }>();
  // How many tiles have been queued, and the count at each square's latest: queued, then released, until it's taken.
  #queued = 0;
  #queuedAt = new Map<string, number>();
  #releasedAt = new Map<string, number>();
  // Battles under way (`battles.ts`): each attacker drawn on its own, left off its square till its battle's over. The
  //  square attacked is shown as it was before each battle there, till its blow: what was on it then, by battle, in
  //  the order they came. Those that fell at a blow, drawn where they stood till they're gone; and units fallen whose
  //  patch hasn't come, left off.
  #battles = new Battles();
  // Units arriving or leaving with no move (`fades.ts`): the units each square's marked with, and the square each unit's
  //  marked on, to tell, as tiles are taken, which have come and which have gone; those fading out, drawn where they
  //  stood as they were; and those fading in, by the square they're marked on. Not till the view's drawn once.
  #fades = new Fades();
  // The wakes ships walking leave, by their walk's id (`wakes.ts`).
  #wakes = new Wakes();
  #squareUnits = new Map<string, Marked>();
  #unitSquare = new Map<string, string>();
  #fadingOut = new Map<
    string,
    {
      units: Unit[];
      // The one shown on top, ringed as it was, or nothing.
      shown: string | null;
      at: WalkPoint;
      facing: number;
    }
  >();
  #fadingIn = new Map<string, { key: string; unit: string }>();
  #settled = false;
  // What each square released since tiles were last taken was marked with as it was first released, and every unit
  //  marked anywhere then: what tiles taken are told against, as the game marks squares again (the active unit's, say)
  //  after it releases them, before the frame takes them.
  #releasedFrom = new Map<string, Marked>();
  #markedAtRelease: Set<string> | null = null;
  #before = new Map<string, Before>();
  #fallen = new Map<string, Unit[]>();
  // The battles whose attackers have moved on from them, won (`#movedOn`): their parts over before the battles are.
  #attackersDone = new Set<string>();
  // The puffs of smoke drawn where losers fall, and where shots land, by id (`#puff`, `#placeShots`).
  #puffs = new Set<string>();
  // The shots of battles whose attackers shoot (`shots.ts`), by battle: when each of its figures' shots leaves, in its
  //  clip, which have, where they land, on the world's own copy, how many figures it has, and how quick its clip plays.
  #shotsOf = new Map<
    string,
    {
      times: ShotTime[];
      left: Set<number>;
      target: [number, number, number];
      figures: number;
      rate: number;
    }
  >();
  // The shots in flight, or landed and bursting, or with smoke where they left, by id: their battle, what they are,
  //  from where to where, when they leave and land, and how quick their battle's clips play.
  #flying = new Map<
    string,
    {
      battle: string;
      kind: ShotKind;
      from: [number, number, number];
      to: [number, number, number];
      leaves: number;
      lands: number;
      rate: number;
    }
  >();
  #gone = new Set<string>();
  // How the player chose units to move, and whether others' are shown walking.
  #walkOptions: MapView3DDeps['walks'];
  // The unit whose ring is shown, and the square it's on as the map has it: the active unit, but while it walks on after
  //  the game's chosen another, its moves spent, the ring and the camera wait for it to get there (§8.2), so the next unit
  //  isn't shown picked while the last is still walking. Where the camera was asked to go meanwhile, the last asked for.
  #ringed: string | null = null;
  #ringedTile: Coordinate | null = null;
  #centreAfter: Coordinate | null = null;
  // The map pressed while they wait: the walk's over at once (`#hurry`), but the camera stays where the player's
  //  looking, as they may be about to move it.
  #pressed = (): void => {
    if (this.#holding()) {
      this.#centreAfter = null;
    }

    this.#hurry();
  };
  // A key pressed while they wait, as for the unit now active: the walk's over at once, so what it's for is shown where
  //  it is. Not a key typed in a field, a modifier alone, or a shortcut with Ctrl, Cmd or Alt.
  #keyed = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;

    if (
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(event.key) ||
      (target !== null &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)))
    ) {
      return;
    }

    this.#hurry();
  };
  #transport: MapView3DDeps['transport'];
  #picking: Picking | null = null;
  // The square the mouse rests on, waiting to show its tooltip or showing it, and whose tooltips they'd be; and whether
  //  an open one is to be shown again once the frame's banners are drawn: its square has changed, or the banners have
  //  been painted again, hidden or shown.
  #hover: Hover | null = null;
  #hoverChanged = false;
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
  // The interface's banners, where it draws them (`MapView3DDeps['cityBanners']`): each city's painted alone, by its
  //  square, as it was when its square was last marked; the art, its scale and the density they were all last painted
  //  at; the canvas they're drawn on, over the map's; and what stops the theme or the fonts changing being told of.
  #cityBanners: NonNullable<MapView3DDeps['cityBanners']> | null;
  #banners = new Map<
    string,
    { signature: string; banner: CityBannerImage | null }
  >();
  // Whether any banner was drawn the last frame, so a canvas with none is left as it is; and whether one has failed
  //  to paint, which is said once.
  #bannersDrawn = false;
  #bannerFailed = false;
  #bannersPaintedFor = '';
  // Where each city with a banner stands on the land, by its square, worked out once: again only where the land under
  //  it changes.
  #bannerSites = new Map<string, BannerSite>();
  // The banners' canvas's pixels to each of the page's, as it was last sized, or none before it was.
  #bannerRatio: number | null = null;
  // The banners drawn the last frame that take the pointer, in the order they were drawn: each city's square, and where
  //  its banner is on the canvas, in the page's px.
  #bannersShown: {
    key: string;
    left: number;
    top: number;
    right: number;
    bottom: number;
  }[] = [];
  #bannerCanvas: HTMLCanvasElement | null = null;
  #stopRestyled: () => void = (): void => {};
  // A frame asked for to draw in, if one is; and whether it's to draw what's changed (`#draw`), not only units idling.
  #frame: number | null = null;
  #wanted = false;
  // When the last frame drawn in a frame of the browser's began, by its clock; and the squares whose units were asked
  //  to idle in the last, while any did.
  #drawnAt = -Infinity;
  #idlers: ReadonlySet<string> = new Set();
  // The squares marked with a unit, which may idle.
  #unitsMarked = new Set<string>();
  // Keyed by the square, as the 2D map's: a tile waits in `#incomingTiles` until the world has it (`releaseTiles`).
  #incomingTiles = new Map<string, Tile>();
  #tilesToDraw = new Map<string, Tile>();
  // The world's tiles, and how many, when its terrain was last read: replaced, it's read again.
  #worldTiles: Tile[] = [];
  #worldTileCount = 0;
  #activeUnit: Unit | null = null;
  #pendingTile: Coordinate | null = null;
  #unitsShown = true;
  // How big units are drawn: `UNIT_SCALE` times life size, times the size the player chose; and what stops a change to
  //  it being told.
  #unitSize: number;
  // The model each unit type is drawn with, by its type, from the sets of models (`MapView3DDeps['models']`), as each
  //  model's loaded, with the rank of the set it's from: the built-in set's figures for the rest.
  #models = new Map<string, { id: string; rank: number }>();
  #modelOf = (type: string): string | null =>
    this.#models.get(type)?.id ?? null;
  // Whether models have arrived since the squares were last marked: they're all marked again at the next frame, once
  //  however many arrived.
  #modelsArrived = false;
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
    this.#cityBanners = deps.cityBanners ?? null;
    this.#words = { cityName: deps.cityName, unitStatus: deps.unitStatus };
    this.#unitSize = UNIT_SCALE * (deps.unitSize?.get() ?? 1);
    this.#artId = deps.art.id();
    this.world = deps.world;
    this.#land = new Land(deps.world);
    // A city attacked is laid as it was till the blow, as its marker shows it (`#before`): the first battle there's.
    this.#land.keepCities((x, y) => {
      const square = `${x},${y}`;

      for (const before of this.#before.values()) {
        if (before.square === square) {
          return before.city;
        }
      }

      return undefined;
    });
    this.#walks = new Walks(this.#land.layout.period());
    this.#walkOptions = deps.walks;
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
      centreOn: (x, y) => this.#centreSoon(x, y),
      // Drawn again, and the camera settled again: stopping at the poles, or not, changes how far round the world
      //  repeats, and so how far down it looks drawn back (`lowestPitch`).
      changed: () => {
        this.#orbit = this.#settle(this.#orbit);
        this.#draw();
      },
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
        (u, v) => {
          // Somewhere the player chose: not where the camera was to go once the ring's moved on.
          this.#centreAfter = null;
          this.#moveTo({ ...(this.#glide?.to ?? this.#orbit), focus: [u, v] });
        }
      );
    }

    if (deps.debug && deps.mapCanvas.parentElement) {
      this.#stats = this.#statsOverlay(deps.mapCanvas.parentElement);
      // For the console, as `?debug=1` tooling is.
      (window as unknown as { civMap3DView?: MapView3D }).civMap3DView = this;
    }

    // Over the map, after its canvas so it's drawn over it, as the stats are; clicks go through it to the map.
    if (this.#cityBanners !== null && deps.mapCanvas.parentElement) {
      const banners = document.createElement('canvas');

      banners.className = 'map3d-banners';
      banners.setAttribute('aria-hidden', 'true');
      Object.assign(banners.style, {
        left: '0',
        pointerEvents: 'none',
        position: 'absolute',
        top: '0',
      });
      deps.mapCanvas.after(banners);
      this.#bannerCanvas = banners;
    } else {
      // Nowhere to draw them: the cities named over them, as before.
      this.#cityBanners = null;
    }

    this.#bannersPaintedFor = this.#bannersFor();
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
        settle: (orbit) => this.#settle(orbit),
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
    document.addEventListener('keydown', this.#keyed, true);
    deps.mapCanvas.addEventListener('pointerdown', this.#pressed, true);

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
        const size = UNIT_SCALE * (deps.unitSize?.get() ?? 1);

        if (size !== this.#unitSize && !this.#disposed) {
          this.#unitSize = size;
          this.#markAll();
          this.#draw();
        }
      }) ?? ((): void => {});
    // And the yields' icons drawn again from the page's art when it changes, and the banners painted again with it.
    this.#stopArtChanged =
      deps.artChanged?.((): void => {
        if (!this.#disposed) {
          this.#yieldsStale = true;
          this.#paintBannersAgain();
        }
      }) ?? ((): void => {});
    // As they are with the theme, or the fonts loaded, they're painted with.
    this.#stopRestyled =
      this.#cityBanners?.restyled((): void => {
        if (!this.#disposed) {
          this.#paintBannersAgain();
        }
      }) ?? ((): void => {});

    deps.models?.forEach(({ url }, rank) => this.#loadModels(url, rank));
  }

  // The set of models at `url`, `rank`th of the page's, loaded: each unit type its models draw marked again with its
  //  model as each arrives, unless an earlier set's (a lower rank's) already has. One that can't be had leaves what
  //  the type was drawn with, a later set's or the built-in set's figures, said once.
  #loadModels(url: string, rank: number): void {
    this.#stage
      .loadModels?.(url, (id, types) => {
        if (this.#disposed) {
          return;
        }

        const taken = types.filter(
          (type) => (this.#models.get(type)?.rank ?? Infinity) >= rank
        );

        if (taken.length === 0) {
          return;
        }

        taken.forEach((type) => this.#models.set(type, { id, rank }));
        this.#modelsArrived = true;
        this.#draw();
      })
      .catch((error: unknown) =>
        console.warn("The 3D map's models couldn't be loaded:", error)
      );
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
    this.#walks.endAll(0);
    this.#battles.endAll(0);
    this.#fades.endAll();
    this.#fadingOut.clear();
    this.#fadingIn.clear();
    this.#releasedFrom.clear();
    this.#markedAtRelease = null;
    this.#squareUnits.clear();
    this.#unitSquare.clear();
    this.#before.clear();
    this.#fallen.clear();
    this.#attackersDone.clear();
    this.#shotsOf.clear();
    this.#flying.clear();
    this.#gone.clear();
    this.#unpatched.clear();
    this.#unpatchedUnits.clear();
    this.#awaiting.clear();
    document.removeEventListener('keydown', this.#keyed, true);
    this.#canvas.removeEventListener('pointerdown', this.#pressed, true);

    this.#stopUnitSize();
    this.#stopArtChanged();
    this.#stopRestyled();
    this.#bannerCanvas?.remove();
    this.#banners.clear();
    this.#bannerSites.clear();
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
   * A unit moved, or fought: it faces the way it went, or the way it attacked, and a defender faces its attacker. One
   *  that moved walks there, from where it was drawn.
   */
  mapEvent(event: MapEvent): void {
    if (event.kind === 'moved') {
      this.#walk(event.unit, event.from, event.to);
      this.#face(event.unit.id, event.from, event.to);

      return;
    }

    this.#face(event.attacker.id, event.attacker.tile, event.defender.tile);
    this.#face(event.defender.id, event.defender.tile, event.attacker.tile);
    this.#fight(event);
  }

  // A battle: the attacker lunges to the edge between the two squares, and goes back, or fades away there if it lost;
  //  the loser fades away where it stood (`battles.ts`). Where they're drawn with rigged copies, it's paced for their
  //  clips (`clipPace`): one that shoots stands to, and the loser falls, then fades. Till the blow, the square attacked
  //  is shown as it was before.
  //  Not where there are no frames, or the player has asked for less motion, or for units to move at once; nor
  //  between other players with their moves not shown, nor off the screen; nor one whose defender the page doesn't
  //  have where it fought: those show how it went at once. The attacker walking there, it's fought once it's there, as
  //  a rival's step and attack come together; one waiting for its patch there fights from where it stands; one the
  //  page doesn't have there yet, out of the dark, is drawn once it has. A unit's battles too far behind are over at
  //  once.
  #fight({
    attacker,
    defender,
    winner,
  }: Extract<MapEvent, { kind: 'battle' }>): void {
    const speed = this.#walkOptions?.speed() ?? 'normal',
      now = performance.now();

    if (
      typeof requestAnimationFrame !== 'function' ||
      prefersReducedMotion() ||
      speed === 'off' ||
      (attacker.player !== this.#playerId &&
        defender.player !== this.#playerId &&
        !(this.#walkOptions?.rivals() ?? true)) ||
      (!this.#visible(attacker.tile.x, attacker.tile.y, -0.5) &&
        !this.#visible(defender.tile.x, defender.tile.y, -0.5))
    ) {
      return;
    }

    // As the page has it there now: walking there, or waiting for its patch, it's drawn as it's held already, and
    //  marked there once the page has it (`#mark`).
    const attackerUnit = this.world
        .get(attacker.tile.x, attacker.tile.y)
        .units.find(({ id }) => id === attacker.id),
      defenderSquare = `${defender.tile.x},${defender.tile.y}`,
      tile = this.world.get(defender.tile.x, defender.tile.y),
      // A battle there before this one whose patch the page's world hasn't taken yet, as when a rival's attacks come
      //  together: this one's fought on what that one left, its loser gone.
      earlier = [...this.#before.values()]
        .filter(({ square, patched }) => square === defenderSquare && !patched)
        .at(-1),
      // What's on the square attacked, as the page has it before the battle's patch, kept, but those fallen already whose
      //  patch hasn't come: those drawn elsewhere, as one lunging in a battle of its own, aren't drawn there till they're
      //  back (`#mark`).
      before =
        earlier === undefined
          ? tile.units.filter(({ id }) => !this.#gone.has(id)).map(keptUnit)
          : earlier.units.filter(
              ({ id }) => !(earlier.won && id === earlier.defender)
            );

    if (
      this.#gone.has(attacker.id) ||
      !before.some(({ id }) => id === defender.id)
    ) {
      return;
    }

    // Paced for the clips its fighters play, where they're drawn with rigged copies: the attacker as it's drawn, and
    //  the loser as it stood.
    const facts = (unit: Unit | undefined): RigFacts | null => {
        const marker = unit === undefined ? null : this.#unitsMarker([unit]);

        return marker === null ? null : this.#stage.rigFacts?.(marker) ?? null;
      },
      attackerFacts = facts(
        attackerUnit ?? this.#walkingUnits.get(attacker.id)
      ),
      paced = clipPace(
        BATTLE_PACE,
        attackerFacts,
        winner === 'attacker'
          ? facts(before.find(({ id }) => id === defender.id))
          : attackerFacts
      ),
      pace = speed === 'fast' ? quickerBattle(paced) : paced,
      busy = this.#battles.busyUntil([attacker.id, defender.id]),
      longest = Math.max(
        battleLength(pace),
        this.#battles.longest([attacker.id, defender.id])
      );

    if (busy !== null && busy - now > Math.max(BATTLES_BEHIND, 2 * longest)) {
      // Not those moved on from, whose losers fall on.
      this.#battlesOver(
        this.#battles.endWhere(
          (battle) =>
            (battle.attacker === attacker.id ||
              battle.attacker === defender.id) &&
            !this.#battles.released(battle.id),
          now
        )
      );
    }

    // Standing where it walked to, waiting for its step's patch: it fights from there, and the battle's patch is the one
    //  it waits for now.
    this.#stepsOn(attacker.id);

    const [fromU, fromV] = this.#land.layout.centre(
        attacker.tile.x,
        attacker.tile.y
      ),
      [toU, toV] = this.#land.layout.centre(defender.tile.x, defender.tile.y),
      { u: periodU, v: periodV } = this.#land.layout.period(),
      short = (delta: number, period: number | null): number =>
        period === null ? delta : delta - period * Math.round(delta / period),
      du = short(toU - fromU, periodU),
      dv = short(toV - fromV, periodV),
      attackerSquare = `${attacker.tile.x},${attacker.tile.y}`,
      battle = this.#battles.add(
        {
          attacker: attacker.id,
          defender: defender.id,
          attackerSquare: attacker.tile,
          defenderSquare: defender.tile,
          won: winner === 'attacker',
          from: this.#standing(attacker.tile),
          edge: [fromU + du * REACH, fromV + dv * REACH],
          fallsAt: this.#standing(defender.tile),
          facing: this.#facings.get(attacker.id) ?? Math.atan2(du, dv),
          defenderFacing:
            this.#facings.get(defender.id) ?? Math.atan2(-du, -dv),
        },
        now,
        pace,
        // Walking there: once it's there.
        this.#walks.endsAt(attacker.id) ?? now
      );

    // Its attacker's shots, where it shoots, each landing on the square attacked, by the loser's feet.
    const shots = attackerFacts?.clips.fight?.shots ?? [];

    if (pace.clips?.fight && attackerFacts !== null && shots.length > 0) {
      this.#shotsOf.set(battle.id, {
        // Lost, falling at the blow, only those its figures fire before they fall.
        times: shotsFired(
          shotTimes(shots, attackerFacts.figures, attackerFacts.stagger),
          winner !== 'attacker' && pace.clips.die
            ? (pace.reach / 1000) * pace.clips.rate
            : null
        ),
        left: new Set(),
        target: this.#onLand(
          battle.fallsAt.at,
          battle.fallsAt.lift + SHOT_TARGET
        ),
        figures: attackerFacts.figures,
        rate: pace.clips.rate,
      });
    }

    this.#before.set(battle.id, {
      square: defenderSquare,
      city: earlier?.city ?? keptCity(tile.city),
      units: before,
      after: this.#queued,
      won: winner === 'attacker',
      defender: defender.id,
      patched: false,
    });
    // Drawn as the page has it; out of the dark, once it has it there (`#mark`).
    if (attackerUnit !== undefined) {
      this.#walkingUnits.set(attacker.id, attackerUnit);
    }

    // Each waits for the battle's patch: the loser's gone from it, and the winner's as it came out.
    [attacker.id, defender.id].forEach((unit) =>
      this.#awaiting.set(unit, {
        squares: [attackerSquare, defenderSquare],
        after: this.#queued,
      })
    );
    this.#mark(attacker.tile.x, attacker.tile.y);
    this.#mark(defender.tile.x, defender.tile.y);
    this.#draw();
  }

  // The unit `unit` steps from the square `from` to `to`: it walks there (`walks.ts`), drawn on its own, and is left off
  //  the squares it's on till it's there, at the pace the player chose, twice as quick for other players' units. Not
  //  where there are no frames to walk it over, or the player has asked for less motion, or for units to move at once;
  //  nor a rival's off the screen, or with others' units' moves not shown, unless it's walking already; nor one the
  //  page doesn't have where it set off from, as one stepping out of the dark: those are drawn where the patch puts
  //  them, at once.
  #walk(unit: MapEventUnit, from: Coordinate, to: Coordinate): void {
    const speed = this.#walkOptions?.speed() ?? 'normal';

    // The unit ringed: where it is now, as the map has it, walked or not.
    if (unit.id === this.#ringed) {
      this.#ringedTile = to;
    }

    if (
      typeof requestAnimationFrame !== 'function' ||
      prefersReducedMotion() ||
      speed === 'off'
    ) {
      return;
    }

    // Another player's unit stepping on from its battle, as one taking the square it emptied: on its new square once its
    //  battle's over, as the step's patch has it, rather than the battle unseen.
    if (unit.player !== this.#playerId && this.#battles.attacking(unit.id)) {
      this.#awaiting.set(unit.id, {
        squares: [`${from.x},${from.y}`, `${to.x},${to.y}`],
        after: this.#queued,
      });

      return;
    }

    // In a battle: it's over at once, and the unit steps from where it is; or, its blow fallen, the unit steps on from
    //  it, and the loser falls as it would (`Battles#moveOn`).
    this.#movedOn(this.#battles.moveOn(unit.id, performance.now()));

    const walking = this.#walks.walking(unit.id),
      seen =
        this.world.get(from.x, from.y).units.find(({ id }) => id === unit.id) ??
        (this.#leftOff(unit.id) ? this.#walkingUnits.get(unit.id) : undefined),
      own = unit.player === this.#playerId;

    if (
      seen === undefined ||
      (!own &&
        !walking &&
        (!(this.#walkOptions?.rivals() ?? true) ||
          (!this.#visible(from.x, from.y, -0.5) &&
            !this.#visible(to.x, to.y, -0.5))))
    ) {
      return;
    }

    const pace = own ? OWN_PACE : RIVALS_PACE;

    this.#walkingUnits.set(unit.id, seen);
    this.#awaiting.set(unit.id, {
      squares: [`${from.x},${from.y}`, `${to.x},${to.y}`],
      after: this.#queued,
    });
    this.#stepsOn(unit.id);

    // Drawn in the air, it flies an arc, straight; on the ground, along the road between them, as it bends, where one's
    //  drawn.
    const flies = airborne(unitLook(seen._, seen.__ ?? [])),
      via = flies
        ? undefined
        : this.#land.roadPath(from.x, from.y, to.x, to.y)?.slice(1, -1);

    this.#walks.step(
      unit.id,
      from,
      to,
      this.#standing(from),
      {
        ...this.#standing(to),
        ...(via === undefined ? {} : { via }),
      },
      performance.now(),
      speed === 'fast' ? quicker(pace) : pace,
      flies
    );
    // Off the square it set off from, now: `#face` marks it again.
    this.#draw();
  }

  // Where a unit stands on the square (`x`, `y`) as it's marked, on the land as it's drawn: at its middle, or in front
  //  of its city's buildings, whose marker's shown or hidden (`t`): where they stand, with the towns hidden too. As a
  //  point to walk from or to, with how far above the land there that is, and the square's middle, which it faces
  //  between, as a unit standing does.
  #standing(
    { x, y }: Coordinate,
    inCity: boolean = Boolean(this.world.get(x, y).city)
  ): WalkPoint {
    const [u, v] = this.#land.layout.centre(x, y),
      stands = Math.max(0, this.#land.surfaceAt(u, v)),
      at: [number, number] = [u, v + (inCity ? IN_FRONT_OF_CITY : 0)];

    return {
      at,
      lift: stands - Math.max(0, this.#land.surfaceAt(...at)),
      middle: [u, v],
    };
  }

  // A unit waiting for its patch steps on: it walks on from where it stands, and the walk that waited goes on waiting
  //  without it, or is taken away, left with no one.
  #stepsOn(unit: string): void {
    if (!this.#unpatchedUnits.delete(unit)) {
      return;
    }

    this.#unpatched.forEach((walker, id) => {
      const units = walker.units.filter((other) => other !== unit);

      if (units.length === walker.units.length) {
        return;
      }

      if (units.length === 0) {
        this.#unpatched.delete(id);
        this.#takeAway(id);

        return;
      }

      this.#unpatched.set(id, { ...walker, units });
    });
  }

  // Whether a unit's left off the squares it's on: walking, or waiting for its patch; attacking, or fallen in battle and
  //  waiting for the patch that takes it off.
  #leftOff(unit: string): boolean {
    return (
      this.#walks.walking(unit) ||
      this.#unpatchedUnits.has(unit) ||
      this.#battles.attacking(unit) ||
      this.#gone.has(unit)
    );
  }

  // The walkers where they are at `now`, each drawn as its units are now (active, shown or hidden, their size); those
  //  that are there, or given up, taken away, and the squares their units were left off marked again, with them. By
  //  the clock: with no frames for a while, as in a tab out of sight, the first frame drawn again ends those that are
  //  over.
  #placeWalkers(now: number): void {
    this.#walks.dropped().forEach((id) => this.#takeAway(id));
    // Those waiting for their patch, as their units are now: hidden, ringed, their size.
    this.#unpatched.forEach((walker) => this.#drawWalker(walker));

    if (this.#walks.size() === 0) {
      return;
    }

    // Less motion asked for mid-walk, or units to move at once: every walk's over now.
    if (
      prefersReducedMotion() ||
      (this.#walkOptions?.speed() ?? 'normal') === 'off'
    ) {
      this.#walksEnded(this.#walks.endAll(now));

      return;
    }

    const { going, ended } = this.#walks.at(now);

    this.#walksEnded(ended);
    going.forEach((walker) => {
      const marker = this.#drawWalker(walker, true);

      // Drawn sailing, a ship among its units, on top or carrying the one that is: its wake laid behind it.
      if (
        marker !== null &&
        walker.units.some((id) => {
          const unit = this.#walkingUnits.get(id);

          return (
            unit !== undefined &&
            unitLook(unit._, unit.__ ?? []).shape === 'ship'
          );
        })
      ) {
        this.#wakes.trail(walker.id, walker.at, now);
      }
    });
  }

  // The wakes ships leave (`wakes.ts`), as they are at `now`: those of ships sailing followed, as `#placeWalkers` has
  //  just laid them, the rest thinning away and taken off once they're gone. With less motion asked for, or units to
  //  move at once, they're gone at once.
  #placeWakes(now: number): void {
    if (this.#wakes.size() === 0) {
      return;
    }

    if (
      prefersReducedMotion() ||
      (this.#walkOptions?.speed() ?? 'normal') === 'off'
    ) {
      this.#wakes.endAll().forEach((id) => this.#stage.wake(id, null));

      return;
    }

    const { going, gone } = this.#wakes.at(now);

    gone.forEach((id) => this.#stage.wake(id, null));
    going.forEach(({ id, points }) => {
      const [newest] = points;

      if (newest === undefined) {
        this.#stage.wake(id, null);

        return;
      }

      // On the sea, wherever the ship is: one coming into port doesn't lift its wake off the water behind it, and the
      //  land hides what lies over it.
      const [u, v] = this.#wrapped(newest.at);

      this.#stage.wake(id, [u, 0, v], wakeShape(points));
    });
  }

  // A walker drawn as its units are now, where it is: what it's drawn as. Going, its figures walk, where they're drawn
  //  with a rigged copy (plan 2.2), their legs keeping up with how far it's gone (`STRIDE`), from the start of their
  //  walk as it sets off; waiting where it's come, they stand.
  #drawWalker(walker: Walker, going = false): TileMarker | null {
    const marker = this.#walkerMarker(walker.units);
    let clip: { role: ClipRole; seconds: number } | null = null;

    if (going) {
      const last = this.#walked.get(walker.id),
        // Where it is goes on round the world, not back over its seam (`walks.ts`), so every step's walked.
        by =
          (last?.by ?? 0) +
          (last === undefined
            ? 0
            : Math.hypot(walker.at[0] - last.at[0], walker.at[1] - last.at[1]));

      this.#walked.set(walker.id, { at: [walker.at[0], walker.at[1]], by });
      clip = { role: 'move', seconds: by / STRIDE };
    }

    this.#drawFigure(walker, marker, 1, clip);

    return marker;
  }

  // Something walking or fighting (`id`) drawn as `marker`, where it is, `opacity` solid; an aircraft flying, `aloft`
  //  over its stand; its figures posed as `clip` has them, where they're drawn with a rigged copy, or standing.
  #drawFigure(
    {
      id,
      at,
      lift,
      facing,
      aloft = 0,
    }: Pick<Walker, 'id' | 'at' | 'lift' | 'facing'> &
      Partial<Pick<Walker, 'aloft'>>,
    marker: TileMarker | null,
    opacity = 1,
    clip: Fighter['clip'] | null = null
  ): void {
    const signature = marker === null ? null : JSON.stringify(marker);

    if (signature !== (this.#walkersDrawn.get(id) ?? null)) {
      this.#stage.setWalker(id, marker);

      if (signature === null) {
        this.#walkersDrawn.delete(id);
      } else {
        this.#walkersDrawn.set(id, signature);
      }
    }

    if (marker === null) {
      return;
    }

    this.#stage.placeWalker(id, this.#onLand(at, lift), facing, aloft);
    this.#stage.fadeWalker(id, opacity);
    this.#stage.poseWalker?.(
      id,
      clip?.role ?? null,
      clip?.seconds ?? 0,
      clip?.before
    );
  }

  // Where the point `at` on the ground is on the world's own copy.
  #wrapped(at: readonly [number, number]): [number, number] {
    const { u: periodU, v: periodV } = this.#land.layout.period(),
      within = (value: number, period: number | null): number =>
        period === null ? value : ((value % period) + period) % period;

    return [within(at[0], periodU), within(at[1], periodV)];
  }

  // Where the point `at` on the ground is, `lift` over the land there (the sea, where it's under the sea), on the world's
  //  own copy: as the stage places what walks, fights and puffs.
  #onLand(
    at: readonly [number, number],
    lift: number
  ): [number, number, number] {
    const [u, v] = this.#wrapped(at);

    return [u, Math.max(0, this.#land.surfaceAt(u, v)) + lift, v];
  }

  // The walker `id` taken off the stage, if it's drawn.
  #takeAway(id: string): void {
    this.#walked.delete(id);

    if (this.#walkersDrawn.delete(id)) {
      this.#stage.setWalker(id, null);
    }
  }

  // What a walker's drawn as: its units alone, as a square's marked, the one on top the one ringed or the best
  //  defender; their figures turned as it goes, not as they last went. Nothing with its units hidden (`t`), unless
  //  the one ringed is among them.
  #walkerMarker(ids: readonly string[]): TileMarker | null {
    const units = ids.flatMap((id) => {
      const unit = this.#walkingUnits.get(id);

      return unit === undefined ? [] : [unit];
    });

    return this.#unitsMarker(units);
  }

  // What units on their own are drawn as, as a square's are marked, with no city.
  #unitsMarker(
    units: Unit[],
    ringed: string | null = this.#ringed
  ): TileMarker | null {
    return markerFor(
      { city: null, units },
      ringed,
      this.#unitsShown,
      this.#words,
      () => 0,
      this.#unitSize,
      this.#modelOf
    );
  }

  // Whether any of a walker's units is waiting for the patch for its last step, as when meeting a leader holds it.
  #awaitsPatch({ units }: Walker): boolean {
    return units.some((unit) => this.#awaiting.has(unit));
  }

  // Walkers that are there, or stopped: those whose patch hasn't come stand where they ended till it does; the rest are
  //  taken away, and the squares their units were left off marked again with them, unless they walk on.
  #walksEnded(ended: Walker[]): void {
    const squares = new Set<string>();

    ended.forEach((walker) => {
      // Those attacking from where they walked to are drawn fighting from now on.
      const waiting = {
        ...walker,
        units: walker.units.filter((unit) => !this.#battles.attacking(unit)),
      };

      if (waiting.units.length > 0 && this.#awaitsPatch(waiting)) {
        this.#unpatched.set(waiting.id, waiting);
        waiting.units.forEach((unit) => this.#unpatchedUnits.add(unit));
        this.#drawWalker(waiting);

        return;
      }

      this.#takeAway(walker.id);
      walker.units.forEach((unit) => this.#unpatchedUnits.delete(unit));
      this.#release(walker.units, squares);
    });

    this.#released(squares);
  }

  // `units` are back on the squares they were left off, those `squares` are added to, to be marked again, unless they're
  //  still left off: walking on, or fighting. Those fallen are let go of, their squares marked again without them.
  #release(units: readonly string[], squares: Set<string>): void {
    units.forEach((unit) => {
      if (this.#leftOff(unit) && !this.#gone.has(unit)) {
        return;
      }

      this.#heldFor.get(unit)?.forEach((key) => squares.add(key));
      this.#heldFor.delete(unit);
      this.#walkingUnits.delete(unit);
    });
  }

  // `squares` marked again, units walking or fighting back on them: and the unit ringed there, or waiting for its patch,
  //  as the game is, the ring and the camera go where the game has them.
  #released(squares: Set<string>): void {
    const ringed = this.#ringed;

    if (
      ringed !== null &&
      ringed !== (this.#activeUnit?.id ?? null) &&
      !this.#walks.walking(ringed) &&
      !this.#battles.holds(ringed)
    ) {
      this.#caughtUp(squares);
    }

    squares.forEach((key) => {
      const [x, y] = key.split(',').map(Number) as [number, number];

      this.#mark(x, y);
    });
  }

  // The battles under way at `now`: the blows that have fallen since, those that are over, and what's drawn of each,
  //  as `#placeWalkers` has walks. Less motion asked for mid-battle, or units to move at once: every battle's over now.
  #placeBattles(now: number): void {
    const puffed = new Set<string>();

    if (this.#battles.size() === 0) {
      this.#puffsOver(puffed);

      return;
    }

    if (
      prefersReducedMotion() ||
      (this.#walkOptions?.speed() ?? 'normal') === 'off'
    ) {
      this.#battlesOver(this.#battles.endAll(now));
      this.#puffsOver(puffed);

      return;
    }

    const { going, struck, ended } = this.#battles.at(now);

    struck.forEach((battle) => this.#blow(battle, true));
    going.forEach((fighter) => {
      // Walking there yet, it's drawn walking.
      if (!fighter.fallen && this.#walks.walking(fighter.unit)) {
        this.#takeAway(fighter.id);

        return;
      }

      if (this.#drawFighter(fighter)) {
        puffed.add(this.#puff(fighter));
      }
    });
    this.#placeShots(now, going, puffed);
    this.#battlesEnded(ended);
    this.#puffsOver(puffed);
  }

  // The shots of the battles under way at `now` (`shots.ts`): each figure's leaving the node its clip names as the
  //  attacker's clip comes to it, where the figure's drawn now, or where the attacker is, and flying to the square
  //  attacked as its kind flies (`SHOT_LOOKS`), pointing the way it goes; one from a muzzle leaving smoke there, with a
  //  flash (`MUZZLE_PUFF`); each landed bursting in a puff of smoke there (`HIT_PUFF`), a shell's with a flash. Each
  //  puff's as quick as the battle's clips, added to `puffed`, then gone. Its attacker not drawn, as with units hidden
  //  (`t`) but for the one ringed, none is.
  #placeShots(now: number, going: Fighter[], puffed: Set<string>): void {
    // By the battle's clock (`fought`), not the clip its figures play: an attacker that's lost falls at the blow, its
    //  last figures' shots, quick ones landing before they've all left, still to leave (those it fires before it falls:
    //  `shotsFired`).
    going.forEach(({ id, battle, at, lift, fallen, fought }) => {
      const plan = this.#shotsOf.get(battle);

      if (plan === undefined || fallen || fought === undefined) {
        return;
      }

      plan.times.forEach((time, index) => {
        if (plan.left.has(index) || fought < time.leaves) {
          return;
        }

        const from =
            this.#stage.jointAt?.(id, time.figure, time.joint) ??
            this.#onLand(at, lift + SHOT_TARGET),
          // Its target's copy nearest where it leaves, over the world's seam or not.
          { u: periodU, v: periodV } = this.#land.layout.period(),
          near = (value: number, to: number, period: number | null) =>
            period === null
              ? value
              : value + period * Math.round((to - value) / period),
          target: [number, number, number] = [
            near(plan.target[0], from[0], periodU),
            plan.target[1],
            near(plan.target[2], from[2], periodV),
          ],
          // As its clip came to it, though the frame's later.
          leaves = now - ((fought - time.leaves) * 1000) / plan.rate;

        plan.left.add(index);
        this.#flying.set(`${battle}-shot-${index}`, {
          battle,
          kind: time.kind,
          from,
          to: landsAt(from, target, time.figure, plan.figures),
          leaves,
          lands: leaves + SHOT_LOOKS[time.kind].flight / plan.rate,
          rate: plan.rate,
        });
      });
    });

    this.#flying.forEach(
      ({ battle, kind, from, to, leaves, lands, rate }, id) => {
        const look = SHOT_LOOKS[kind],
          muzzle = `${id}-muzzle`,
          hit = `${id}-hit`;

        // Its puffs, not drawn this frame, are taken away with the rest (`#puffsOver`). One in flight lands as its
        //  attacker moves on from its battle, but with units hidden (`t`).
        if (
          !this.#walkersDrawn.has(battle) &&
          !(this.#battles.released(battle) && this.#unitsShown)
        ) {
          this.#stage.shot?.(id, null);
          this.#flying.delete(id);

          return;
        }

        // The smoke where it left a muzzle, with its flash, from when it left: seen though it lands in the same frame.
        const leaving =
            look.muzzle > 0 && ((now - leaves) * rate) / MUZZLE_PUFF,
          // Its puff where it lands, from when it landed: a shell's bursts, with a flash.
          landed = now < lands ? false : ((now - lands) * rate) / HIT_PUFF;

        if (leaving !== false && leaving < 1) {
          this.#puffs.add(muzzle);
          this.#stage.puff(muzzle, from, leaving, look.muzzle, 0);
          puffed.add(muzzle);
        }

        if (landed === false) {
          const through = (now - leaves) / (lands - leaves);

          this.#stage.shot?.(
            id,
            shotAt(from, to, through, look.arc),
            through,
            kind,
            shotHeading(from, to, through, look.arc)
          );

          return;
        }

        this.#stage.shot?.(id, null);

        if (landed < 1) {
          this.#puffs.add(hit);
          this.#stage.puff(
            hit,
            to,
            landed,
            look.hit,
            look.burst ? FLASH_SIZE : null
          );
          puffed.add(hit);
        }

        if (landed >= 1 && (leaving === false || leaving >= 1)) {
          this.#flying.delete(id);
        }
      }
    );
  }

  // The shots of `battle`, over: those in flight taken away, and those bursting gone with their puffs.
  #shotsOver(battle: string): void {
    this.#shotsOf.delete(battle);
    this.#flying.forEach((shot, id) => {
      if (shot.battle === battle) {
        this.#stage.shot?.(id, null);
        this.#stage.puff(`${id}-hit`, null);
        this.#puffs.delete(`${id}-hit`);
        this.#stage.puff(`${id}-muzzle`, null);
        this.#puffs.delete(`${id}-muzzle`);
        this.#flying.delete(id);
      }
    });
  }

  // A puff of smoke where the loser `fighter` falls (`markers/puff.ts`), as far through as it's faded: its id.
  #puff({ battle, at, lift, opacity }: Fighter): string {
    const id = `${battle}-puff`;

    this.#puffs.add(id);
    this.#stage.puff(id, this.#onLand(at, lift), 1 - opacity);

    return id;
  }

  // The puffs of smoke not in `puffed`, drawn this frame, taken away: their battles over, or their loser no longer
  //  drawn, as with units hidden.
  #puffsOver(puffed: ReadonlySet<string>): void {
    this.#puffs.forEach((id) => {
      if (!puffed.has(id)) {
        this.#puffs.delete(id);
        this.#stage.puff(id, null);
      }
    });
  }

  // Battles over at once, as `Battles#endWhere` has them: their blows fall now, with nothing left to fade; but for one
  //  only told its blow, going on, whose loser falls as it would.
  #battlesOver({ struck, ended }: { struck: Battle[]; ended: Battle[] }): void {
    struck.forEach((battle) => this.#blow(battle, !ended.includes(battle)));
    this.#battlesEnded(ended);
  }

  // A unit moved on from its battles (`Battles#moveOn`): those over at once, over; those it won attacking going on for
  //  their losers, it drawn no more there, its square marked again unless it's walked on (`#attackerDone`); and the ring
  //  free to go on, where it waited for one of them.
  #movedOn({
    struck,
    ended,
    released,
  }: {
    struck: Battle[];
    ended: Battle[];
    released: Battle[];
  }): void {
    const squares = new Set<string>();

    this.#battlesOver({ struck, ended });
    released.forEach((battle) => {
      if (battle.won) {
        this.#attackersDone.add(battle.id);
        this.#attackerDone(battle, squares);
      }
    });
    this.#released(squares);
  }

  // The blow falls in `battle`: the square attacked is shown as it is after it, or as it was before the next battle
  //  there; what fell, drawn where it stood to fade away, if it's `shown`; and the loser left off till its patch comes,
  //  if it hasn't.
  #blow(battle: Battle, shown: boolean): void {
    const { square, units } = this.#before.get(battle.id) ?? {
        square: '',
        units: [],
      },
      { x, y } = battle.defenderSquare,
      next = [...this.#before.entries()].find(
        ([id, before]) => id !== battle.id && before.square === square
      )?.[1],
      after = new Set(
        (next?.units ?? this.world.get(x, y).units).map(({ id }) => id)
      ),
      loser = battle.won ? battle.defender : battle.attacker,
      fell = units.filter(
        ({ id }) =>
          (battle.won && id === battle.defender) ||
          (!after.has(id) && !this.#leftOff(id))
      );

    this.#before.delete(battle.id);
    // Its city laid as it is now, or as the next battle there kept it.
    this.#land.changed([[x, y]], ...this.#focus());

    if (this.#awaiting.has(loser)) {
      this.#gone.add(loser);
    }

    if (shown && battle.won && fell.length > 0) {
      this.#fallen.set(battle.id, fell);
    }

    this.#mark(x, y);
  }

  // What the square `key` is marked with now, for telling which units come and go (`#fadeChanged`): `units`, kept as
  //  they are, the one shown on top, whether it's ringed, and whether it stands in front of a city. One fading out marked
  //  again, come back, say, is over: it's drawn here.
  #drawnOn(
    key: string,
    units: Unit[],
    { shown, ringed, inCity }: Omit<Marked, 'units'>
  ): void {
    (this.#squareUnits.get(key)?.units ?? []).forEach(({ id }) => {
      if (this.#unitSquare.get(id) === key) {
        this.#unitSquare.delete(id);
      }
    });

    if (units.length === 0) {
      this.#squareUnits.delete(key);
    } else {
      this.#squareUnits.set(key, {
        units: units.map(keptUnit),
        shown,
        ringed,
        inCity,
      });
    }

    units.forEach(({ id }) => this.#unitSquare.set(id, key));

    if (this.#fadingOut.size > 0) {
      const back = [...this.#fadingOut.entries()]
        .filter(([, out]) =>
          out.units.some((unit) => units.some(({ id }) => id === unit.id))
        )
        .map(([id]) => id);

      back.forEach((id) => this.#fades.end(id));
      this.#fadesOver(back);
    }
  }

  // Whether units coming and going fade: with frames, motion not asked against, and walks not chosen to be at once.
  //  With units hidden (`t`), none's shown but the active one, so only it can.
  #fadesShown(): boolean {
    return (
      typeof requestAnimationFrame === 'function' &&
      !prefersReducedMotion() &&
      (this.#walkOptions?.speed() ?? 'normal') !== 'off'
    );
  }

  // Whether the unit `id` is drawn anywhere: marked on a square, or walking or fighting, or waiting for its patch, as a
  //  loser fallen in battle does. Those fading where they fell were taken off their square at the blow, not as tiles
  //  were taken, so never count as gone.
  #drawnAnywhere(id: string): boolean {
    return this.#unitSquare.has(id) || this.#leftOff(id);
  }

  // Tiles taken: the unit shown on a released square, `before`, that isn't drawn anywhere now fades out where it stood,
  //  with those gone with it, as one disbanded or lost, or gone out of sight, does; a unit beneath it going goes unseen.
  //  On a square that showed none, the unit on top now, if it wasn't marked anywhere (`markedBefore`), nor drawn walking
  //  or fighting, fades in, as one built or come into sight does; one shown over another comes at once. On the screen
  //  only, and a few at once: more, anywhere, as a turn handed over sends, come and go at once.
  #fadeChanged(
    before: ReadonlyMap<string, Marked>,
    markedBefore: ReadonlySet<string>
  ): void {
    const gone: [string, Marked, Unit[]][] = [],
      come: [string, string][] = [];

    before.forEach((was, key) => {
      const left = was.units.filter(({ id }) => !this.#drawnAnywhere(id)),
        top = this.#squareUnits.get(key)?.shown ?? null;

      if (was.shown !== null && left.some(({ id }) => id === was.shown)) {
        gone.push([key, was, left]);
      }

      if (was.units.length === 0 && top !== null && !markedBefore.has(top)) {
        come.push([key, top]);
      }
    });

    if (
      gone.length + come.length === 0 ||
      gone.length + come.length > FADES_AT_ONCE
    ) {
      return;
    }

    const onScreen = ([key]: [string, ...unknown[]]): boolean => {
      const [x, y] = key.split(',').map(Number) as [number, number];

      return this.#visible(x, y, 0);
    };

    const now = performance.now(),
      duration =
        (this.#walkOptions?.speed() ?? 'normal') === 'fast' ? FADE / 2 : FADE;

    gone.filter(onScreen).forEach(([key, was, units]) => {
      const [x, y] = key.split(',').map(Number) as [number, number];

      // As it was shown: where it stood, in front of a city it stood in front of, the one on top on top.
      this.#fadingOut.set(this.#fades.add('out', now, duration), {
        units: [
          ...units.filter(({ id }) => id === was.shown),
          ...units.filter(({ id }) => id !== was.shown),
        ],
        shown: was.ringed ? was.shown : null,
        at: this.#standing({ x, y }, was.inCity),
        facing: was.shown === null ? 0 : this.#facings.get(was.shown) ?? 0,
      });
    });
    come.filter(onScreen).forEach(([key, unit]) => {
      this.#fadingIn.set(this.#fades.add('in', now, duration), {
        key,
        unit,
      });
      this.#stage.fadeMarker(key, 0);
    });
    this.#draw();
  }

  // The fades under way at `now`: those fading out drawn where they stood, as solid as they are; those fading in, as
  //  solid as they are, while they're still the unit on top of their square; those over, solid or taken away. With
  //  less motion asked for, units to move at once, or units hidden, all are over at once.
  #placeFades(now: number): void {
    if (this.#fades.size() === 0) {
      return;
    }

    if (!this.#fadesShown()) {
      this.#fadesOver(this.#fades.endAll());

      return;
    }

    const { going, ended } = this.#fades.at(now),
      cut: string[] = [];

    going.forEach(({ id, opacity }) => {
      const out = this.#fadingOut.get(id),
        coming = this.#fadingIn.get(id);

      if (out !== undefined) {
        const marker = this.#unitsMarker(out.units, out.shown);

        // Units hidden (`t`): it's over, not drawn again once they're shown.
        if (marker === null) {
          this.#fades.end(id);
          cut.push(id);

          return;
        }

        this.#drawFigure(
          {
            id,
            at: [out.at.at[0], out.at.at[1]],
            lift: out.at.lift,
            facing: out.facing,
          },
          marker,
          opacity
        );

        return;
      }

      if (coming === undefined) {
        return;
      }

      // Another on top there now, or the unit gone, walking say: its fade's over.
      if ((this.#squareUnits.get(coming.key)?.shown ?? null) !== coming.unit) {
        this.#fades.end(id);
        cut.push(id);

        return;
      }

      this.#stage.fadeMarker(coming.key, opacity);
    });
    this.#fadesOver([...ended, ...cut]);
  }

  // The fades `ids` over: those fading out taken away, and those fading in solid.
  #fadesOver(ids: readonly string[]): void {
    ids.forEach((id) => {
      const coming = this.#fadingIn.get(id);

      if (this.#fadingOut.delete(id)) {
        this.#takeAway(id);
      }

      // Solid, unless another's fading in there now.
      if (coming !== undefined) {
        this.#fadingIn.delete(id);

        if (
          ![...this.#fadingIn.values()].some(({ key }) => key === coming.key)
        ) {
          this.#stage.fadeMarker(coming.key, 1);
        }
      }
    });
  }

  // What's drawn of a battle: the attacker, as the patch has it now, or what fell, as it was. Whether it's the loser,
  //  drawn fading, which a puff of smoke goes with.
  #drawFighter(fighter: Fighter): boolean {
    const fallen = this.#fallen.get(fighter.battle);

    if (fighter.fallen && fallen === undefined) {
      return false;
    }

    const marker = fighter.fallen
      ? this.#unitsMarker(fallen!)
      : this.#walkerMarker([fighter.unit]);

    this.#drawFigure(fighter, marker, fighter.opacity, fighter.clip ?? null);

    // The loser, drawn fading: what fell where it stood, or the attacker at the edge, having lost.
    return marker !== null && (fighter.fallen || fighter.opacity < 1);
  }

  // Battles that are over, taken away: each attacker back on its square, or, won and waiting for the battle's patch,
  //  standing where it stood till it comes; fallen, left off till it does.
  #battlesEnded(ended: Battle[]): void {
    if (ended.length === 0) {
      return;
    }

    const squares = new Set<string>();

    ended.forEach((battle) => {
      const { id } = battle;

      this.#shotsOver(id);
      this.#takeAway(`${id}-fallen`);
      this.#fallen.delete(id);

      if (this.#before.delete(id)) {
        this.#land.changed(
          [[battle.defenderSquare.x, battle.defenderSquare.y]],
          ...this.#focus()
        );
      }

      // Its attacker's part over already, as it moved on: what's drawn under its id now is the attacker's own.
      if (!this.#attackersDone.delete(id)) {
        this.#attackerDone(battle, squares);
      }
    });

    this.#released(squares);
  }

  // The attacker's part of `battle` over: drawn no more there, and back on the square it was left off, added to
  //  `squares`, unless it's walking on; or, waiting for the patch that has it where it fought from, drawn standing there
  //  till it comes (or let go of, lost). Once, as it moves on from it (`#movedOn`), or as the battle's over.
  #attackerDone(battle: Battle, squares: Set<string>): void {
    const { id, attacker, won, from, attackerSquare, facing } = battle;

    if (this.#awaiting.has(attacker) && !this.#leftOff(attacker)) {
      if (!won) {
        this.#gone.add(attacker);
      } else {
        const standing: Walker = {
          id,
          units: [attacker],
          at: [from.at[0], from.at[1]],
          lift: from.lift,
          aloft: 0,
          facing,
          from: attackerSquare,
          before: attackerSquare,
          to: attackerSquare,
        };

        this.#unpatched.set(id, standing);
        this.#unpatchedUnits.add(attacker);
        this.#drawWalker(standing);

        return;
      }
    }

    this.#takeAway(id);
    this.#release([attacker], squares);
  }

  // The unit ringed is there: the ring on the active unit, the squares it moves between added to `squares`, to be marked
  //  again, a walk waiting for its patch drawn again without it; and the camera where it was asked to go meanwhile.
  #caughtUp(squares: Set<string>): void {
    const active = this.#activeUnit;

    [this.#ringedTile, active?.tile].forEach((tile) => {
      if (tile) {
        squares.add(`${tile.x},${tile.y}`);
      }
    });
    this.#ringed = active?.id ?? null;
    this.#ringedTile = active?.tile ?? null;
    this.#unpatched.forEach((walker) => this.#drawWalker(walker));

    const after = this.#centreAfter;

    if (after !== null) {
      this.#centreAfter = null;
      this.#centreOn(after.x, after.y);
    }
  }

  // Whether the ring and the camera wait: the unit ringed walks on, and the game's chosen another.
  #holding(): boolean {
    const ringed = this.#ringed;

    return (
      ringed !== null &&
      ringed !== (this.#activeUnit?.id ?? null) &&
      (this.#walks.walking(ringed) || this.#battles.holds(ringed))
    );
  }

  // While they wait, the unit ringed's walk is over at once, and they go where the game has them.
  #hurry(): void {
    const ringed = this.#ringed;

    if (ringed === null || !this.#holding()) {
      return;
    }

    this.#walksEnded(
      this.#walks.endWhere((units) => units.includes(ringed), performance.now())
    );
    this.#movedOn(this.#battles.moveOn(ringed, performance.now(), true));
    this.#draw();
  }

  // Whether the game would still offer the unit ringed, as the map has it where it's walking to: active (one boarding a
  //  ship is asleep aboard, and isn't), with moves left, as the engine offers a unit. Another chosen while it would, the
  //  player's moved on.
  #ringedOffered(): boolean {
    const tile = this.#ringedTile,
      unit =
        tile === null
          ? undefined
          : this.world
              .get(tile.x, tile.y)
              .units.find(({ id }) => id === this.#ringed);

    return (
      unit !== undefined &&
      unit.active !== false &&
      (unit.moves?.value ?? 0) > 0
    );
  }

  // The camera to the square at (`x`, `y`): while the ring waits, once the unit ringed is there, so it doesn't leave it
  //  mid-walk; the active unit's own walk, or anyone else's, holds it for no one.
  #centreSoon(x: number, y: number): void {
    if (this.#holding()) {
      this.#centreAfter = { x, y };

      return;
    }

    this.#centreOn(x, y);
  }

  // Tiles have come, the squares `released` and when each was queued: the units whose last step's patch it is have it,
  //  and the walks that were waiting for it are over, wherever it's put their units.
  #patched(released: ReadonlyMap<string, number>): void {
    this.#awaiting.forEach(({ squares, after }, unit) => {
      if (squares.some((key) => (released.get(key) ?? 0) > after)) {
        this.#awaiting.delete(unit);
        this.#gone.delete(unit);
      }
    });

    if (this.#unpatched.size === 0) {
      return;
    }

    const over = [...this.#unpatched.values()].filter(
      (walker) => !this.#awaitsPatch(walker)
    );

    over.forEach((walker) => this.#unpatched.delete(walker.id));
    this.#walksEnded(over);
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
    const key = `${tile.x},${tile.y}`;

    this.#incomingTiles.set(key, tile);
    this.#queuedAt.set(key, ++this.#queued);
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
    const fading = this.#settled && this.#fadesShown();

    if (
      fading &&
      this.#incomingTiles.size > 0 &&
      this.#markedAtRelease === null
    ) {
      // Marked on a square, or drawn walking or fighting.
      this.#markedAtRelease = new Set([
        ...this.#unitSquare.keys(),
        ...this.#walkingUnits.keys(),
      ]);
    }

    this.#incomingTiles.forEach((tile, key) => {
      const queuedAt = this.#queuedAt.get(key) ?? 0;

      if (fading && !this.#releasedFrom.has(key)) {
        this.#releasedFrom.set(
          key,
          this.#squareUnits.get(key) ?? {
            units: [],
            shown: null,
            ringed: false,
            inCity: false,
          }
        );
      }

      this.#tilesToDraw.set(key, tile);
      this.#releasedAt.set(key, queuedAt);
      // A battle's patch for the square attacked: the page's world has it now.
      this.#before.forEach((before) => {
        if (before.square === key && queuedAt > before.after) {
          before.patched = true;
        }
      });
    });
    this.#incomingTiles.clear();
    this.#queuedAt.clear();

    if (this.#tilesToDraw.size > 0) {
      this.#draw();
    }
  }

  /** Marks `unit` as the one awaiting orders, and the one before as not. */
  setActiveUnit(unit: Unit | null, pendingTile?: Coordinate | null): void {
    const before = this.#activeUnit?.tile;

    this.#activeUnit = unit;
    this.#pendingTile = pendingTile ?? null;

    // Another chosen while the game would still offer the unit ringed (`w`, a click): the player's moved on from it, and
    //  its walk's over at once. Its moves spent, or asleep aboard a ship, the game's chosen the next: the ring waits for
    //  it to get there.
    if (this.#holding() && this.#ringedOffered()) {
      this.#hurry();
    }

    if (this.#holding()) {
      this.#draw();

      return;
    }

    // Not waiting, or no longer: where the camera was to go once the ring moved on is for no one now.
    this.#centreAfter = null;

    const ringedTile = this.#ringedTile;

    this.#ringed = unit?.id ?? null;
    this.#ringedTile = unit?.tile ?? null;

    [before, ringedTile, unit?.tile].forEach((tile) => {
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
   * Brings the units and towns back if they were hidden (`t`), as the 2D map does for a unit to give orders to. The
   *  squares it changed are drawn with the units (slice 2.1).
   */
  showActiveUnit(changed: Tile[]): void {
    void changed;

    if (!this.#unitsShown) {
      this.#unitsShown = true;
      this.#land.showTowns(true, ...this.#focus());
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

  /**
   * Hides the units, but the unit awaiting orders, and the cities, their walls, names and towns, or shows them again
   *  (`t`), so the land shows as it is. The towns are laid with the land, so it's laid again without them, or with them.
   */
  toggleUnits(): void {
    this.#unitsShown = !this.#unitsShown;
    this.#land.showTowns(this.#unitsShown, ...this.#focus());
    this.#markAll();
    // The banners hidden or shown: an open tooltip over one goes, or one over the land may be over one now.
    this.#hoverChanged = true;
    this.#draw();
  }

  /** Shows or hides what each square yields (`y`), over the squares in the world. */
  toggleYields(): void {
    this.#yieldsShown = !this.#yieldsShown;
    this.#yieldsStale = true;
    // The banners may give way to them, or come back.
    this.#hoverChanged = true;
    this.#draw();
  }

  /** Brings the camera `steps` nearer, or further away for fewer than none, about the point it looks at. */
  zoomBy(steps: number): void {
    this.#endHover();
    this.#orbit = this.#settle(zoomed(this.#orbit, steps));

    // Both ends of a glide, so it carries on at the new distance rather than easing back to the old one, each settled
    //  as the camera is: drawn back, looking down as far as it does.
    if (this.#glide !== null) {
      this.#glide.from = this.#settle(zoomed(this.#glide.from, steps));
      this.#glide.to = this.#settle(zoomed(this.#glide.to, steps));
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

    // As the camera will look: where it's gliding to, or where it's to go once the ring's moved on.
    const after = this.#centreAfter,
      orbit: Orbit =
        after === null
          ? this.#glide?.to ?? this.#orbit
          : {
              ...(this.#glide?.to ?? this.#orbit),
              focus: this.#land.layout.centre(after.x, after.y),
            },
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

  // The square under (`x`, `y`) in the canvas's px: what's shown there, on the world. A unit's figures first, as they
  //  stand over the ground of the square behind, twice life size, or flying; then the land or the water over it.
  //  Nothing above the horizon, or past a pole the world doesn't wrap over.
  #tileAt(x: number, y: number): Tile | null {
    const width = this.#canvas.clientWidth,
      height = this.#canvas.clientHeight;

    if (width <= 0 || height <= 0) {
      return null;
    }

    const ndc: [number, number] = [(x / width) * 2 - 1, 1 - (y / height) * 2],
      unit = this.#stage.unitAt?.(ndc) ?? null;

    if (unit !== null) {
      const [unitX, unitY] = unit.split(',').map(Number) as [number, number];

      return this.world.get(unitX, unitY);
    }

    const ground = pickGround(
      this.#orbit,
      this.#lookHeight ?? 0,
      ndc,
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

  // The city whose banner is under (`x`, `y`) in the canvas's px, as the banners were last drawn, and where its banner
  //  is: of banners that overlap, the one on top. Not one whose city has gone since, which lets it through to any
  //  beneath.
  #bannerAt(
    x: number,
    y: number
  ): { tile: Tile; box: { left: number; top: number; bottom: number } } | null {
    for (let index = this.#bannersShown.length - 1; index >= 0; index--) {
      const { key, left, top, right, bottom } = this.#bannersShown[index]!;

      if (x >= left && x < right && y >= top && y < bottom) {
        const [tileX, tileY] = key.split(',').map(Number) as [number, number],
          tile = this.world.get(tileX, tileY);

        if (tile?.city) {
          return { tile, box: { left, top, bottom } };
        }
      }
    }

    return null;
  }

  // A click on the map: for the square being chosen, if one is, or else what a click does, as on the 2D map, with the
  //  city whose banner it's on, if it's on one.
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

    // A city's banner hangs past its square, over the land below it, as on the 2D map (#747).
    const bannerCity = this.#bannerAt(x, y)?.tile.city ?? null;

    if (tile !== null || bannerCity !== null) {
      this.#squares.click(this.portal, tile, bannerCity);
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

  // What has a tooltip under (`x`, `y`) in the canvas's px: a city's banner, about its city's square, or else the
  //  square. Over a banner, it opens over the banner, so moving off it onto the land is a new hover.
  #subjectAt(
    x: number,
    y: number
  ): {
    key: string;
    tile: Tile;
    box: { left: number; top: number; bottom: number } | null;
  } | null {
    const banner = this.#bannerAt(x, y);

    if (banner !== null) {
      return {
        key: `banner ${banner.tile.x},${banner.tile.y}`,
        ...banner,
      };
    }

    const tile = this.#tileAt(x, y);

    return tile === null
      ? null
      : { key: `${tile.x},${tile.y}`, tile, box: null };
  }

  // The mouse rests at a point on the canvas, or has left it (`null`): the tooltip for the city's banner or the square
  //  under it opens after a moment, if the interface has one for it. Not while the other players move, or over a menu.
  #hovered(
    at: { x: number; y: number; clientX: number; clientY: number } | null
  ): void {
    const subject =
        at === null || this.#waiting || this.#squares.menuOpen()
          ? null
          : this.#subjectAt(at.x, at.y),
      current = this.#hover;

    if (subject === null || at === null) {
      this.#endHover();

      return;
    }

    const {
      key,
      tile: { x, y },
    } = subject;

    // Still the same square or banner: wait on, or leave it open.
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
      x,
      y,
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

  // The tooltip for the banner or the square the mouse rests on, as it is now, over the banner, or the mouse: or none,
  //  if a window has opened over the map since, or what's under the mouse is something else now, or it has nothing to
  //  say any more.
  #showHover(hover: Hover): void {
    const over =
        typeof document.elementFromPoint !== 'function' ||
        document.elementFromPoint(hover.clientX, hover.clientY) ===
          this.#canvas,
      under = over ? this.#subjectAt(hover.canvasX, hover.canvasY) : null;

    if (under === null || under.key !== hover.key) {
      this.#endHover();

      return;
    }

    const canvas =
        under.box === null ? null : this.#canvas.getBoundingClientRect(),
      opened = this.#squares.tooltip(
        this.#canvas,
        under.tile,
        this.#playerId,
        canvas === null || under.box === null
          ? {
              left: hover.clientX - 10,
              top: hover.clientY - 10,
              bottom: hover.clientY + 10,
            }
          : {
              left: canvas.left + under.box.left,
              top: canvas.top + under.box.top,
              bottom: canvas.top + under.box.bottom,
            }
      );

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
  //  player stops it at them; its pitch and distance within their ranges; and looking down at least as far as its
  //  distance needs on this world (`lowestPitch`), so drawn back, it doesn't see the world repeat to the horizon.
  #settle(orbit: Orbit): Orbit {
    const kept = clampOrbit(orbit),
      period = this.#period();

    return settled(
      {
        ...kept,
        pitch: Math.max(kept.pitch, lowestPitch(kept.distance, period)),
      },
      period,
      this.#land.extentV()
    );
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

  // The tiles released: the land round any whose land changed queued to be built again, and each marked again. The
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

    // The squares whose land changed, and those beside them, where their land meets: a range's ridge may rise or fall
    //  as far as that, under what stands there.
    const reshaped = this.#besides(
        this.#land.changed(squares, ...this.#focus(), replaced)
      ),
      released = new Set(squares.map(([x, y]) => `${x},${y}`)),
      // When each was queued, to tell a step's patch from those before it.
      queuedAt = new Map(
        [...released].map((key) => [key, this.#releasedAt.get(key) ?? 0])
      );

    this.#releasedAt.clear();

    // What each released square was marked with, and every unit marked anywhere, as they were released, to tell which
    //  have come and gone.
    const before = this.#releasedFrom,
      markedBefore = this.#markedAtRelease;

    this.#releasedFrom = new Map();
    this.#markedAtRelease = null;
    // Drawn fading out, too, the unit shown on top (first): one come back, its fade cut as it's marked again, was drawn,
    //  so doesn't fade in. Those beneath it weren't.
    this.#fadingOut.forEach(({ units: [drawn] }) => {
      if (drawn !== undefined) {
        markedBefore?.add(drawn.id);
      }
    });

    squares.forEach(([x, y]) => this.#mark(x, y));
    // What stands on them, marked again on the land as it is now: only where something's marked, and not released. A
    //  world replaced has every square marked again, below.
    reshaped.forEach(([x, y]) => {
      const key = `${x},${y}`;

      if (!replaced && !released.has(key) && this.#marked.has(key)) {
        this.#mark(x, y);
      }
    });
    this.#yieldsChanged(squares, reshaped);

    // Where the cities stand, worked out again where the land under them may have changed: a world sent again with a
    //  square newly seen says which, as for the yields.
    reshaped.forEach(([x, y]) => this.#bannerSites.delete(`${x},${y}`));

    // The square an open tooltip is about has changed: it says what's there now, once the banners are drawn as they are
    //  now, so one over a banner moves with it, or goes if it's no longer under the mouse.
    const hover = this.#hover;

    if (
      hover !== null &&
      hover.open &&
      squares.some(([x, y]) => x === hover.x && y === hover.y)
    ) {
      this.#hoverChanged = true;
    }

    if (squares.length > 0 || replaced) {
      this.#minimapStale = true;
    }

    if (replaced) {
      // Its tiles may yield something else, with none released: the identity of their yields says which.
      this.#yieldsStale = true;
      this.#marked.forEach((_, key) => {
        const [x, y] = key.split(',').map(Number) as [number, number];

        this.#mark(x, y);
      });
    }

    // A world replaced, most of it released at once, as an observer's change of view sends it: what comes and goes is a
    //  whole new view, not units arriving or leaving.
    if (
      markedBefore !== null &&
      this.#fadesShown() &&
      !(replaced && released.size * 2 >= tiles.length)
    ) {
      this.#fadeChanged(before, markedBefore);
    }

    // Walks that were waiting for their patch, over if it's come.
    if (squares.length > 0) {
      this.#patched(queuedAt);
    }
  }

  // What's on the square at (`x`, `y`), marked on the land at its middle, or nothing.
  #mark(x: number, y: number): void {
    const key = `${x},${y}`,
      tile = this.world.get(x, y),
      // Attacked, with the blow still to fall: shown as it was before the battle.
      attacked = this.#battles.awaitingBlow({ x, y }),
      shownBefore =
        attacked === null ? undefined : this.#before.get(attacked.id),
      // As it was, and any that have come since.
      units =
        shownBefore === undefined
          ? tile.units
          : [
              ...shownBefore.units,
              ...tile.units.filter(
                ({ id }) => !shownBefore.units.some((kept) => kept.id === id)
              ),
            ],
      // Units walking here, or waiting for their patch, or attacking from here, are drawn walking or fighting, not
      //  here, until they're there or back: marked again then. Those fallen are only left off.
      walking = tile.units.filter(
        ({ id }) => this.#leftOff(id) && !this.#gone.has(id)
      );

    // Each drawn walking as the patch has it now, hurt in a battle say.
    walking.forEach((unit) => {
      const held = this.#heldFor.get(unit.id) ?? new Set<string>();

      held.add(key);
      this.#heldFor.set(unit.id, held);
      this.#walkingUnits.set(unit.id, unit);
    });

    const drawn = units.filter(({ id }) => !this.#leftOff(id)),
      city = shownBefore === undefined ? tile.city : shownBefore.city,
      marked = markerFor(
        shownBefore === undefined && drawn.length === tile.units.length
          ? tile
          : { city, units: drawn },
        this.#ringed,
        this.#unitsShown,
        this.#words,
        (unit) => this.#facings.get(unit.id) ?? 0,
        this.#unitSize,
        this.#modelOf
      ),
      // With its banner hung below its square, a city's name isn't over it too.
      marker =
        marked?.city && this.#bannerOf(key, tile, city) !== null
          ? { ...marked, city: { ...marked.city, unnamed: true as const } }
          : marked;

    if (!city) {
      this.#banners.delete(key);
      this.#bannerSites.delete(key);
    }

    this.#drawnOn(key, drawn, {
      shown: marker?.unit?.id ?? null,
      ringed: marker?.unit?.active === true,
      inCity: (marker?.unit ?? null) !== null && marker?.inCity === true,
    });

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
      this.#remember(key, signature);

      if (marker?.unit) {
        this.#unitsMarked.add(key);
      } else {
        this.#unitsMarked.delete(key);
      }
    }
  }

  // The banner for the city on the square `key` as it's shown (`city`, before a battle there, say): painted again only
  //  if what it says has changed (`key`, the page's), as the density changing paints them all again (`#bannersFor`); or
  //  nothing, where the interface draws none, or it couldn't be painted (a browser short of what the interface draws
  //  with), which leaves the city named over it, and is said once.
  #bannerOf(
    key: string,
    tile: Tile,
    city: Tile['city']
  ): CityBannerImage | null {
    if (this.#cityBanners === null || !city) {
      return null;
    }

    const density = this.#bannerDensity(),
      shown = { ...tile, city },
      kept = this.#banners.get(key);
    let signature = '!',
      banner: CityBannerImage | null = null;

    try {
      signature = String(this.#cityBanners.key(shown));

      if (kept?.signature === signature) {
        return kept.banner;
      }

      banner = this.#cityBanners.paint(shown, density);
    } catch (error) {
      if (!this.#bannerFailed) {
        this.#bannerFailed = true;
        console.error(error);
      }
    }

    this.#banners.set(key, { signature, banner });

    return banner;
  }

  // How many of the screen's pixels the banners have to each of the 2D map's: as big as the 2D map shows them, drawn at
  //  the whole scale at or above its zoom and shown at the zoom (`Portal#setZoom`), and as sharp as the screen.
  //  The screen's pixels as the banners' canvas was last sized for them, so the two agree till it's sized again.
  #bannerDensity(): number {
    return (
      (this.#bannerRatio ?? (window.devicePixelRatio || 1)) *
      (this.#art.zoom() / this.#art.scale())
    );
  }

  // Where the city on the square `key` stands on the land as it's drawn: its square's middle and its outline's corners.
  #bannerSiteOf(key: string): BannerSite {
    let site = this.#bannerSites.get(key);

    if (site === undefined) {
      const [x, y] = key.split(',').map(Number) as [number, number],
        [u, v] = this.#land.layout.centre(x, y),
        up = (pu: number, pv: number) =>
          Math.max(0, this.#land.surfaceAt(pu, pv));

      site = {
        key,
        centre: [u, up(u, v), v],
        outline: this.#land.layout
          .outline(x, y)
          .map(([ou, ov]) => [ou, up(ou, ov), ov] as const),
      };
      this.#bannerSites.set(key, site);
    }

    return site;
  }

  // What the banners are painted for: the art, its scale and the density, any of which changing paints them all again.
  #bannersFor(): string {
    return `${this.#art.id()} ${this.#art.scale()} ${this.#bannerDensity()}`;
  }

  // The banners painted again, as the theme, the fonts loaded, the art they're painted with or its size have changed:
  //  every city's square marked again, which paints them, and its name taken off or put back as one is painted or not.
  #paintBannersAgain(): void {
    this.#repaintBanners();
    this.#draw();
  }

  // As `#paintBannersAgain`, in a frame being drawn, which draws them next.
  #repaintBanners(): void {
    this.#bannersPaintedFor = this.#bannersFor();
    this.#banners.clear();
    this.#markAll();
    // Painted at another size: an open tooltip over one moves with it.
    this.#hoverChanged = true;
  }

  // The banners over the map, drawn after it each frame: each below its city's square as the camera sees it now, the
  //  lower on the screen over the higher. None with the units hidden (`t`), nor where they give way to the yields.
  #drawBanners(): void {
    const canvas = this.#bannerCanvas;

    if (canvas === null || this.#cityBanners === null) {
      return;
    }

    // Painted for other art, another size of it, or another screen (chosen mid-game, the zoom changed in Options, the
    //  window moved): all painted again first, whichever were painted since.
    if (this.#bannersFor() !== this.#bannersPaintedFor) {
      this.#repaintBanners();
    }

    const context = canvas.getContext('2d');

    // None to take the pointer till they're drawn again.
    this.#bannersShown = [];

    if (context === null) {
      return;
    }

    // Cleared of the last frame's, if it drew any.
    if (this.#bannersDrawn) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      this.#bannersDrawn = false;
    }

    if (
      !this.#unitsShown ||
      (this.#yieldsShown && this.#cityBanners.giveWayToYields)
    ) {
      return;
    }

    const width = this.#canvas.clientWidth,
      height = this.#canvas.clientHeight,
      ratio = canvas.width / Math.max(1, width),
      sites: BannerSite[] = [];

    if (width <= 0 || height <= 0) {
      return;
    }

    let widest = 0;

    this.#banners.forEach(({ banner }, key) => {
      if (banner === null) {
        return;
      }

      widest = Math.max(widest, banner.width / ratio);
      sites.push(this.#bannerSiteOf(key));
    });

    // A step down from the square, as on the 2D map.
    const gap = Math.round(this.#art.scale() * this.#bannerDensity());

    bannerPlaces(sites, {
      orbit: this.#orbit,
      look: this.#lookHeight ?? 0,
      width,
      height,
      period: this.#period(),
      reach: widest,
    }).forEach(({ key, x, y, clear }) => {
      const banner = this.#banners.get(key)?.banner;

      if (banner) {
        const left = Math.round(x * ratio - banner.centre),
          top = Math.round(y * ratio) + gap;

        // Faded into the haze as the land is.
        context.globalAlpha = clear;
        context.drawImage(banner.image, left, top);
        this.#bannersDrawn = true;

        if (clear >= BANNER_TAKES_POINTER) {
          this.#bannersShown.push({
            key,
            left: left / ratio,
            top: top / ratio,
            right: (left + banner.width) / ratio,
            bottom: (top + banner.height) / ratio,
          });
        }
      }
    });
    context.globalAlpha = 1;
  }

  // Squares that changed (`squares`), their yields laid out again; and those whose land may stand higher or lower
  //  (`reshaped`: those whose land changed, which a world replaced, by a square newly seen, say, may add to, and their
  //  neighbours). A tile replaced with yields of its own is told by them (`#showYields`).
  #yieldsChanged(
    squares: readonly (readonly [number, number])[],
    reshaped: readonly (readonly [number, number])[]
  ): void {
    if (squares.length === 0 && reshaped.length === 0) {
      return;
    }

    squares.forEach(([x, y]) => this.#yieldsLaid.delete(`${x},${y}`));
    reshaped.forEach(([x, y]) => this.#yieldsLaid.delete(`${x},${y}`));
    this.#yieldsStale = true;
  }

  // `squares`, and the squares beside each, once each.
  #besides(
    squares: readonly (readonly [number, number])[]
  ): [number, number][] {
    const topology = this.world.topology(),
      found = new Map<string, [number, number]>();

    squares.forEach(([x, y]) => {
      found.set(`${x},${y}`, [x, y]);
      topology.directions().forEach((direction) => {
        const next = topology.neighbour(x, y, direction);

        if (next !== null) {
          found.set(`${next[0]},${next[1]}`, next);
        }
      });
    });

    return [...found.values()];
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

  // Every square the world has, and every one marked before or with a banner.
  #markAll(): void {
    const squares = new Set([...this.#marked.keys(), ...this.#banners.keys()]);

    this.world.tiles().forEach(({ x, y }) => squares.add(`${x},${y}`));
    squares.forEach((key) => {
      const [x, y] = key.split(',').map(Number) as [number, number];

      this.#mark(x, y);
    });
  }

  // A frame: the tiles released taken, as many chunks built as the budget allows (every one, where there are no
  //  frames to spread them over), the camera on the square the map is centred on, and the scene drawn. Another frame
  //  is asked for while chunks wait, and one only for units idling while they do. Drawn only for them (`idleOnly`),
  //  nothing else has changed: they're posed, and the scene drawn.
  #frameDrawn(budget: number | null, idleOnly = false): void {
    const started = performance.now();

    if (idleOnly) {
      const idling = this.#idle(started, false);

      this.#stage.render();
      this.#frameTime = performance.now() - started;
      this.#showStats();

      if (idling) {
        this.#ask();
      }

      return;
    }

    const moving = this.#moveCamera(started),
      [u, v] = this.#focus();

    if (this.#modelsArrived) {
      this.#modelsArrived = false;
      this.#markAll();
    }

    this.#takeTiles();
    this.#placeWalkers(started);
    this.#placeWakes(started);
    this.#placeBattles(started);
    this.#placeFades(started);

    // Centred elsewhere since: the chunks nearest the new centre are built first.
    if (`${u},${v}` !== this.#focused) {
      this.#focused = `${u},${v}`;
      this.#land.refocus(u, v);
    }

    this.#land.build(this.#stage, budget);

    const rising = this.#followHeight(budget !== null);

    this.#showYields();
    this.#stage.view(this.#orbit, this.#lookHeight ?? 0, this.#period());

    const idling = this.#idle(started, true);

    this.#stage.render();
    this.#drawBanners();

    if (this.#hoverChanged) {
      this.#hoverChanged = false;

      if (this.#hover?.open) {
        this.#showHover(this.#hover);
      }
    }

    this.#showMinimap();
    this.#keepDistance();
    this.#frameTime = performance.now() - started;
    // Drawn once: units that come and go from now on fade.
    this.#settled = true;
    this.#showStats();

    if (
      this.#land.pending() > 0 ||
      this.#land.overlaysPending() > 0 ||
      this.#walks.size() > 0 ||
      this.#battles.size() > 0 ||
      this.#fades.size() > 0 ||
      this.#wakes.size() > 0 ||
      moving ||
      rising
    ) {
      this.#draw();
    } else if (idling) {
      this.#ask();
    }
  }

  // The units idling (`Stage#idle`) posed as their clips have them `now`, by the page's clock: those near the camera,
  //  worked out again (`again`) where anything may have changed; or none, where they may not idle now. Says whether
  //  any idles, so another frame is to be drawn for them.
  #idle(now: number, again: boolean): boolean {
    if (this.#stage.idle === undefined) {
      return false;
    }

    // Near the camera, as it looks now (`idling.ts`).
    if (again || !this.#mayIdle()) {
      this.#idlers = this.#mayIdle()
        ? idleSquares(
            this.#unitsMarked,
            this.#orbit,
            (x, y) => this.#land.layout.centre(x, y),
            this.#period(),
            this.#idlers,
            (x, y, margin) => this.#visible(x, y, margin)
          )
        : new Set();
    }

    const idling =
      this.#stage.idle(this.#idlers, now / 1000) && this.#mayIdle();

    // None idling: none goes on further next time (`idleSquares`), as one idling would.
    if (!idling) {
      this.#idlers = new Set();
    }

    return idling;
  }

  // Whether units may idle: not without frames to play their clips in, with motion reduced, nor with units' moves not
  //  shown.
  #mayIdle(): boolean {
    return (
      typeof requestAnimationFrame === 'function' &&
      !prefersReducedMotion() &&
      (this.#walkOptions?.speed() ?? 'normal') !== 'off'
    );
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

    // The unit ringed, as the map shows it: while it walks on, not yet the next.
    const active = this.#holding()
      ? this.#ringedTile
      : this.#activeUnit?.tile ?? null;

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
      far = sightFor(this.#orbit.distance, this.#period()).far,
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

    this.#wanted = true;
    this.#ask();
  }

  // A frame asked for, if one isn't already: drawn whole if anything's asked for one by then (`#draw`), whenever it
  //  comes; otherwise only for units idling, and only once `IDLE_FRAME` has passed since the last began, the frames
  //  between passed over.
  #ask(): void {
    if (this.#disposed || this.#frame !== null) {
      return;
    }

    // Timed by when the browser's frame began, as it gives it, so one whose callback starts a little late isn't passed
    //  over; or by the clock, where it doesn't.
    this.#frame = requestAnimationFrame((time?: number) => {
      const began = typeof time === 'number' ? time : performance.now();

      this.#frame = null;

      if (this.#wanted) {
        this.#wanted = false;
        this.#drawnAt = began;
        this.#frameDrawn(BUILD_BUDGET);

        return;
      }

      if (began - this.#drawnAt < IDLE_FRAME) {
        this.#ask();

        return;
      }

      this.#drawnAt = began;
      this.#frameDrawn(BUILD_BUDGET, true);
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

    // The banners' canvas over the map's, as big, in the screen's own pixels.
    if (this.#bannerCanvas !== null) {
      Object.assign(this.#bannerCanvas.style, {
        height: `${height}px`,
        left: `${this.#canvas.offsetLeft || 0}px`,
        top: `${this.#canvas.offsetTop || 0}px`,
        width: `${width}px`,
      });
      this.#bannerCanvas.width = Math.round(width * ratio);
      this.#bannerCanvas.height = Math.round(height * ratio);
      this.#bannerRatio = ratio;
    }

    // What floats over the map sits elsewhere over it now.
    this.measureCovered();
    this.#stage.render();
    this.#drawBanners();
  }
}

export default MapView3D;
