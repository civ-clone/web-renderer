import { DragSample, releaseVelocity } from '@civ-clone/ui-widgets/lib/drag';
import { Coordinate, Tile, Unit } from '@civ-clone/ui-protocol/types';
import {
  TooltipContent,
  hideTooltip,
  showTooltipOver,
  tooltipOpenOver,
} from '@civ-clone/ui-component-tooltip/Tooltip';
import cityBannerTooltip, {
  hasBannerTooltip,
} from '@civ-clone/ui-hud/components/Map/cityBannerTooltip';
import squareTooltip, {
  hasSquareTooltip,
} from '@civ-clone/ui-hud/components/Map/squareTooltip';
import {
  ZOOM_STEP,
  mapTileset,
  zoomFor,
  zoomOption,
} from '@civ-clone/ui-assets/lib/tilesets';
import { TilesetDescriptor } from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';
import { hasFeature } from '@civ-clone/ui-platform/lib/interfaceMode';
import { openUnitSelection } from '@civ-clone/ui-city/components/choices';
import { instance as options } from '@civ-clone/ui-platform/GameOptionsRegistry';
import Portal from '@civ-clone/ui-map/components/Portal';
import { Rect } from '@civ-clone/ui-map/lib/viewport';
import prefersReducedMotion from '@civ-clone/ui-map/lib/reducedMotion';
import mapMenus from '@civ-clone/ui-menus/components/mapMenus';
import ActionWindow from '@civ-clone/ui-component-window/ActionWindow';
import { on } from '@dom111/element';
import { t } from 'i18next';

// How far, in px, a press has to move before it is a drag rather than a click
// or a long press. Enough to absorb a wobbling finger.
const DRAG_THRESHOLD = 8,
  // How much of its speed a glide keeps after each 16ms frame.
  INERTIA_FRICTION = 0.92,
  // Below this, in px per ms, a glide is over.
  INERTIA_MIN_SPEED = 0.02,
  // A hard flick is a few px per ms. Two pointer events a millisecond apart
  // can make a short drag look many times faster than that, and would throw
  // the map clean across the world.
  INERTIA_MAX_SPEED = 3,
  // How long the mouse rests on a city's banner, or a square, before its tooltip opens, as the shared tooltip's (#742).
  HOVER_TOOLTIP_DELAY = 400,
  // How far, in px, the wheel turns for a tenth of zoom (#1101), past the first turn after a pause, which makes a tenth
  //  however small: a mouse turned a notch at a time zooms a tenth a notch, whatever its browser counts a notch as (as
  //  little as a few px). A trackpad's two-finger scroll sends a few px at a time, added up until they reach this. A
  //  wheel counted in lines or pages (Firefox's mouse) makes a tenth each time it turns.
  WHEEL_STEP = 50,
  // A trackpad's pinch, which comes as the wheel with Ctrl held, sends smaller deltas still: a pinch to twice the size
  //  is about 70 px.
  PINCH_STEP = 8,
  // Past this long, in ms, without the wheel turning, what it turned before is forgotten: a new turn starts afresh.
  WHEEL_PAUSE = 250,
  // The most tenths a turn counted in px makes (#1139), a pinch's aside. A trackpad's flick runs on as it slows, with no
  //  pause, and would otherwise run the zoom to one end of its range: past this, the rest of it is the map's, and does
  //  nothing. A whole scale's worth, so a mouse's wheel spun fast still zooms far.
  WHEEL_TURN_TENTHS = 10;

// What the wheel has turned since it last made a tenth of zoom, in px, which way (-1 or 1, 0 before it has), when it
//  last turned, and how many tenths this turn has made.
type WheelTurn = {
  delta: number;
  direction: number;
  at: number;
  tenths: number;
};

// Safari's `GestureEvent` (#1138), which isn't in the DOM's types: a trackpad's pinch, `scale` times the size it was
//  when it began, and where on the page it is (on a Mac: iOS's has no `clientX` or `clientY`).
type GestureEvent = UIEvent & {
  scale: number;
  clientX?: number;
  clientY?: number;
};

// A pinch in Safari over the map (#1138): the zoom the fingers' spread is measured from, in the set it's for, and when
//  it last moved.
type Gesture = {
  from: number;
  tileset: TilesetDescriptor;
  at: number;
};

// The zoom the wheel or the keys have asked for, waiting for the next frame (#1101), the set it's for, and where on the
//  canvas to keep still.
type PendingZoom = {
  zoom: number;
  tileset: TilesetDescriptor;
  anchor?: Coordinate;
};

type Drag = {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  dragging: boolean;
  samples: DragSample[];
};

// What the mouse rests on that has a tooltip: one of your cities' banners (#747), or a square (#748). The key says which
//  (a city by its id, as its data is replaced as it changes), `tile` is the square it's about, `box` where on the canvas
//  the tooltip opens over.
type HoverSubject = {
  key: string;
  tile: Coordinate;
  box: Rect;
  content: () => TooltipContent;
};

// The subject the mouse rests on, where the mouse is last seen on the canvas and in the window, and the wait before its
//  tooltip opens.
type Hover = {
  key: string;
  tile: Coordinate;
  offsetX: number;
  offsetY: number;
  clientX: number;
  clientY: number;
  timer: number | null;
};

// A square being chosen for a long-range order (M2b): which squares it takes, what is done with the one clicked, and the
//  window that says so, whose closing gives up.
type Picking = {
  accept: (tile: Tile) => boolean;
  onPick: (tile: Tile) => void;
  window: ActionWindow | null;
};

export class GamePortal extends Portal {
  #activeUnit: Unit | null = null;
  #picking: Picking | null = null;
  #drag: Drag | null = null;
  #hover: Hover | null = null;
  #inertiaFrame: number | null = null;
  #pendingZoom: PendingZoom | null = null;
  #wheelTurn: WheelTurn = { delta: 0, direction: 0, at: -Infinity, tenths: 0 };
  #gesture: Gesture | null = null;
  #zoomFrame: number | null = null;
  #showActionMenuTimeout: number | null = null;
  #waiting = false;

  /**
   * Takes the next click on a square `accept` allows for `onPick` (a long-range order's target, M2b), instead of what a
   *  click does: a window says what for (`prompt`), and closing it, or Escape, gives up. A click on any other square
   *  does nothing. The map's cursor is a crosshair meanwhile. Choosing again gives up the last.
   */
  pickTile(
    accept: (tile: Tile) => boolean,
    onPick: (tile: Tile) => void,
    prompt: string
  ): void {
    this.#endPicking();

    const picking: Picking = { accept, onPick, window: null };

    this.#picking = picking;
    this.canvas().classList.add('picking-tile');

    picking.window = new ActionWindow(t('DistantOrder.square.title'), prompt, {
      classes: ['actionWindow', 'pick-tile'],
      actions: {
        primary: {
          label: t('Generic.cancel'),
          cancel: true,
          action: (window) => window.close(),
        },
      },
    });

    picking.window.on('close', () => {
      if (this.#picking === picking) {
        this.#picking = null;
        this.canvas().classList.remove('picking-tile');
      }
    });
  }

  /** Whether a square is being chosen for a long-range order. */
  picking(): boolean {
    return this.#picking !== null;
  }

  /** Gives up choosing a square, if one is being chosen: the window goes, and a click is a click again. */
  endPicking(): void {
    this.#endPicking();
  }

  #endPicking(): void {
    const picking = this.#picking;

    if (picking === null) {
      return;
    }

    this.#picking = null;
    this.canvas().classList.remove('picking-tile');
    picking.window?.close();
  }

  protected override bindEvents(): void {
    // A tooltip goes with anything that moves the map under it, a press, a key, or the mouse leaving.
    this.on('focus-changed', () => this.endHover());
    on(this.canvas(), 'pointerleave', () => this.endHover());

    on(this.canvas(), 'pointerup', (event) => {
      // Only the primary pointer drives the map: a second finger landing or
      // lifting mid-gesture must not end the first finger's drag, or count as
      // a click of its own.
      if (!event.isPrimary) {
        return;
      }

      const drag = this.#drag;

      // A press that started somewhere else, or that a long press has already
      //  taken, isn't a click on the map (#490).
      if (drag === null) {
        return;
      }

      this.#drag = null;

      if (drag.dragging) {
        // The map stops where it was let go for a player who has asked for less motion (#856).
        if (!prefersReducedMotion()) {
          this.glide(releaseVelocity(drag.samples, event.timeStamp));
        }

        return;
      }

      const realTarget = document.elementFromPoint(
        event.clientX,
        event.clientY
      );

      if (realTarget?.matches('.unit-actions *')) {
        return;
      }

      this.clearTimeout();

      const [x, y] = this.toCanvas(event.offsetX, event.offsetY),
        tile = this.tileAt(x, y),
        // A city's banner hangs past its square, over its neighbours (#747).
        bannerCity = this.cityAt(x, y);

      if (tile !== null) {
        this.emit('tile-clicked', tile.x, tile.y);
      }

      // Choosing a square for a long-range order (M2b): the click is for that, and only a square it takes is taken.
      if (this.#picking !== null) {
        const picking = this.#picking;

        if (tile !== null && picking.accept(tile)) {
          this.#endPicking();
          picking.onPick(tile);
        }

        return;
      }

      const playerTileUnits = (tile?.units ?? []).filter(
        (unit: Unit) => unit.player.id === this.playerId()
      );

      // A click on a banner is for its city, unless the square under it is a city's, or has units of ours, which a click
      //  opens or selects wherever they are: the banner's city opens, or the map centres on it. A banner can hang past
      //  a locked pole.
      if (bannerCity !== null && !tile?.city && playerTileUnits.length === 0) {
        if (!this.openCity(bannerCity)) {
          this.setCenter(bannerCity.tile.x, bannerCity.tile.y);
        }

        return;
      }

      // Past a locked pole: nothing there to open or centre on.
      if (tile === null) {
        return;
      }

      // A city that opens, or the square's units; a city that doesn't open (another civilisation's) is a square like
      //  any other.
      const opened = tile.city ? this.openCity(tile.city) : false;

      if (!opened && playerTileUnits.length) {
        openUnitSelection(playerTileUnits, this.transport(), (unit: Unit) =>
          this.emit('activate-unit', unit)
        );

        return;
      }

      this.setCenter(tile.x, tile.y);
    });

    const showActionMenu = (tile: Tile, x: number, y: number) => {
      this.clearTimeout();

      if (this.#activeUnit === null) {
        return;
      }

      this.#showActionMenuTimeout = window.setTimeout(() => {
        // The press has become a long press, so it is not a drag any more:
        // moving now would slide the map out from under the menu.
        this.#drag = null;

        // The unit's menu is another way to give it orders: choosing a square for one ends (M2b).
        this.#endPicking();

        // The interface's menu over the press (#808, #860).
        mapMenus
          .current()
          .unitMenu(
            this,
            x,
            y,
            this.#activeUnit as Unit,
            tile,
            this.transport(),
            true
          );
      }, 350);
    };

    // A right-click opens the same menu at once, without the hold, in place of the browser's own, where the interface's
    //  does (#808).
    on(this.canvas(), 'contextmenu', (event) => {
      const menus = mapMenus.current();

      if (!menus.unitMenuOnRightClick) {
        return;
      }

      event.preventDefault();

      // One a long press has already opened: a touch's `contextmenu` arrives after the hold that opened it.
      if (menus.isOpen()) {
        return;
      }

      const tile = this.tileAt(...this.toCanvas(event.offsetX, event.offsetY));

      // Nothing to offer: the press is left as it was, a tap or a drag.
      if (tile === null || this.#activeUnit === null) {
        return;
      }

      this.clearTimeout();
      this.#drag = null;
      this.endHover();
      this.#endPicking();

      menus.unitMenu(
        this,
        event.clientX,
        event.clientY,
        this.#activeUnit,
        tile,
        this.transport(),
        false
      );
    });

    // The wheel, or a trackpad's pinch, zooms the map about the pointer (#1101). Not passive: over the map, it's the
    //  map's, and neither scrolls the page nor, with Ctrl as a pinch sends it, zooms the page.
    on(this.canvas(), 'wheel', (event: WheelEvent) => this.#wheel(event), {
      passive: false,
    });

    // Safari's trackpad pinch comes as gestures instead (#1138), which would zoom the page.
    on(
      this.canvas(),
      'gesturestart',
      (event: Event) => this.#pinch(event as GestureEvent, 'start'),
      { passive: false }
    );
    on(
      this.canvas(),
      'gesturechange',
      (event: Event) => this.#pinch(event as GestureEvent, 'change'),
      { passive: false }
    );
    on(
      this.canvas(),
      'gestureend',
      (event: Event) => this.#pinch(event as GestureEvent, 'end'),
      { passive: false }
    );

    // Prevent dragging address bar down by accident
    on(this.canvas(), 'touchstart', (event) => event.preventDefault());

    on(this.canvas(), 'pointerdown', (event) => {
      event.preventDefault();

      this.endHover();

      if (!event.isPrimary) {
        return;
      }

      // A right-click that opens the unit's menu (#808) is the menu's, not a press on the map: some browsers send its
      //  `contextmenu` only once the button is up, which would otherwise be a click on the square first.
      if (event.button === 2 && mapMenus.current().unitMenuOnRightClick) {
        // Not under the menu it's about to open.
        this.stopGlide();

        return;
      }

      // Catching a gliding map stops it where it is, as it would a real one.
      this.stopGlide();

      this.#drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        dragging: false,
        samples: [
          { x: event.clientX, y: event.clientY, time: event.timeStamp },
        ],
      };

      // The press is the map's until it is let go, wherever that is: over the
      // sidebar, off the window or on a window opened under the pointer.
      // Released there without it, the map kept following the mouse with no
      // button held (#490).
      this.canvas().setPointerCapture(event.pointerId);

      const tile = this.tileAt(...this.toCanvas(event.offsetX, event.offsetY));

      if (tile !== null) {
        showActionMenu(tile, event.x, event.y);
      }
    });

    on(this.canvas(), 'pointermove', (event) => {
      const drag = this.#drag;

      // No tooltip over an open menu (#808).
      if (drag === null && mapMenus.current().isOpen()) {
        this.endHover();

        return;
      }

      if (drag === null) {
        this.hover(event);

        return;
      }

      if (drag.pointerId !== event.pointerId) {
        return;
      }

      if (
        !drag.dragging &&
        Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) <
          DRAG_THRESHOLD
      ) {
        return;
      }

      if (!drag.dragging) {
        drag.dragging = true;

        this.clearTimeout();
      }

      // The map follows the pointer, so the view moves the opposite way: as far on the canvas as the pointer moved on
      //  the page, which is further when the canvas is shown smaller (#1063).
      this.scrollBy(
        ...this.toCanvas(drag.lastX - event.clientX, drag.lastY - event.clientY)
      );

      drag.lastX = event.clientX;
      drag.lastY = event.clientY;

      drag.samples.push({
        x: event.clientX,
        y: event.clientY,
        time: event.timeStamp,
      });

      // Only the tail is used to work out the release speed.
      if (drag.samples.length > 20) {
        drag.samples.shift();
      }
    });

    on(this.canvas(), 'pointercancel', (event) => {
      if (!event.isPrimary) {
        return;
      }

      this.#drag = null;

      this.clearTimeout();
    });
  }

  /**
   * Zooms the map `steps` tenths in, or out where it's less than none (#1101), within its set's range (`zoomFor`), and
   *  keeps the zoom as the Options slider does (`zoomOption`). About `anchor`, in the page's px from the canvas's top
   *  left corner, which stays over the same spot, or else the middle.
   *
   * Applied on the next frame: a fast wheel or a key held down asks many times a frame, and a new whole scale redraws
   *  every layer, so what's asked within one frame adds up and is drawn once.
   */
  zoomBy(steps: number, anchor?: Coordinate): void {
    const tileset = mapTileset(this.world().topologyId()),
      from = this.#zoomAsked(tileset),
      zoom = zoomFor(tileset, from + steps * ZOOM_STEP);

    if (zoom === from) {
      return;
    }

    this.#pendingZoom = { zoom, tileset, anchor };

    if (this.#zoomFrame !== null) {
      return;
    }

    this.#zoomFrame = window.requestAnimationFrame(() => {
      const pending = this.#pendingZoom;

      this.#zoomFrame = null;
      this.#pendingZoom = null;

      // Nothing waiting, or it was asked for in the art the map was drawn with before it changed.
      if (
        pending === null ||
        pending.tileset !== mapTileset(this.world().topologyId())
      ) {
        return;
      }

      options.set(zoomOption(pending.tileset), pending.zoom);
      this.setZoom(pending.zoom, pending.anchor);
    });
  }

  /**
   * The zoom the map will be at on the next frame: what's waiting for it, or else its zoom now. Asked for since the
   *  map's art changed (#1118), what's waiting is the other set's, and is forgotten.
   */
  #zoomAsked(tileset: TilesetDescriptor): number {
    return this.#pendingZoom?.tileset === tileset
      ? this.#pendingZoom.zoom
      : this.zoom();
  }

  /**
   * Safari's trackpad pinch over the map (#1138): the zoom follows the fingers, the size it began at times how far
   *  they've spread, in tenths, about where they are.
   */
  #pinch(event: GestureEvent, phase: 'start' | 'change' | 'end'): void {
    event.preventDefault();

    if (phase === 'end') {
      this.#gesture = null;

      return;
    }

    const tileset = mapTileset(this.world().topologyId()),
      asked = this.#zoomAsked(tileset);

    if (phase === 'start') {
      // Held still where the fingers are, which a glide would carry off. On a touch screen, the pinch is the first
      //  finger's too: it no longer drags the map, or clicks, or opens a unit's menu as it's held.
      this.stopGlide();
      this.#drag = null;
      this.clearTimeout();
      this.#gesture = { from: asked, tileset, at: event.timeStamp };

      return;
    }

    const gesture = this.#gesture;

    // A change to a pinch that didn't begin over the map.
    if (gesture === null) {
      return;
    }

    gesture.at = event.timeStamp;

    // The map's art changed mid-pinch (#1118): measured afresh, from the new set's zoom.
    if (gesture.tileset !== tileset) {
      gesture.tileset = tileset;
      gesture.from = asked / event.scale;

      return;
    }

    const wanted = gesture.from * event.scale,
      zoom = zoomFor(tileset, wanted);

    // Pinched past either end: measured from there instead, so the zoom turns back as soon as the fingers do.
    if (Math.abs(zoom - wanted) > ZOOM_STEP / 2) {
      gesture.from = zoom / event.scale;
    }

    const steps = Math.round((zoom - asked) / ZOOM_STEP);

    if (steps === 0) {
      return;
    }

    const box = this.canvas().getBoundingClientRect();

    // About the fingers, where Safari says where they are, or else the middle.
    this.zoomBy(
      steps,
      Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
        ? { x: event.clientX! - box.left, y: event.clientY! - box.top }
        : undefined
    );
  }

  /**
   * The wheel turned over the map (#1101): towards the player zooms out, away zooms in, a tenth for each notch or each
   *  `WHEEL_STEP` (`PINCH_STEP` for a pinch) of px turned, about the pointer.
   */
  #wheel(event: WheelEvent): void {
    event.preventDefault();

    // Read first: Firefox counts its mouse's wheel in lines only for a page that asks how it counts before how far.
    const inPixels = event.deltaMode === 0,
      delta = event.deltaY,
      turn = this.#wheelTurn;

    // Safari pinching, should it send the wheel with Ctrl as well: the gesture zooms already. A pinch whose end went
    //  astray (the window losing focus) stops counting once it's been still a moment.
    if (
      delta === 0 ||
      (event.ctrlKey &&
        this.#gesture !== null &&
        event.timeStamp - this.#gesture.at <= WHEEL_PAUSE)
    ) {
      return;
    }

    // Turned the other way, or after a pause: a new turn, which makes a tenth at once, and what was turned before
    //  counts for nothing.
    const direction = Math.sign(delta),
      fresh =
        event.timeStamp - turn.at > WHEEL_PAUSE || direction !== turn.direction;

    turn.at = event.timeStamp;
    turn.direction = direction;

    if (fresh) {
      turn.delta = 0;
      turn.tenths = 0;
    }

    // A trackpad's flick running on past as far as a turn goes (#1139).
    if (inPixels && !event.ctrlKey && turn.tenths >= WHEEL_TURN_TENTHS) {
      return;
    }

    if (!fresh && inPixels) {
      turn.delta += delta;

      // One tenth at most for each turn of the wheel, however far it turned: a notch on a fast wheel is many hundreds
      //  of px.
      if (Math.abs(turn.delta) < (event.ctrlKey ? PINCH_STEP : WHEEL_STEP)) {
        return;
      }

      turn.delta = 0;
    }

    // Only what the cap counts.
    if (inPixels && !event.ctrlKey) {
      turn.tenths += 1;
    }

    // Held still where the pointer is, which a glide would carry off.
    this.stopGlide();

    this.zoomBy(delta < 0 ? 1 : -1, { x: event.offsetX, y: event.offsetY });
  }

  /** While the other players move, the map's tooltips don't open, and any open one goes (#748). */
  setWaiting(waiting: boolean): void {
    this.#waiting = waiting;

    if (waiting) {
      this.endHover();
    }
  }

  // What has a tooltip under the canvas pixel at `x`, `y`: one of your cities' banners, with what it's building, or else
  //  the square, with what it is, where the interface has it and its option is on. A banner with nothing more to say (a rival's)
  //  is about its city's square.
  #subjectAt(x: number, y: number): HoverSubject | null {
    const banner = this.bannerAt(x, y),
      squares =
        hasFeature('squareTooltips') && options.get('squareTooltips', true);

    if (banner !== null && hasBannerTooltip(banner.city)) {
      const { city, box } = banner;

      return {
        key: `city ${city.id}`,
        tile: city.tile,
        box,
        content: () => cityBannerTooltip(city),
      };
    }

    if (!squares) {
      return null;
    }

    const square =
      banner === null
        ? this.squareAt(x, y)
        : {
            tile: this.world().get(banner.city.tile.x, banner.city.tile.y),
            box: banner.box,
          };

    if (square === null || !hasSquareTooltip(square.tile)) {
      return null;
    }

    const { tile, box } = square;

    return {
      // Over a rival's banner it opens over the banner, so moving onto the square is a new hover, over the square.
      key: `square ${tile.x},${tile.y}${banner === null ? '' : ' banner'}`,
      tile,
      box,
      content: () => squareTooltip(tile, this.playerId()),
    };
  }

  // A mouse resting on a banner or a square opens its tooltip. Not on touch, where a long press is the unit menu's, only
  //  while no button is held, as a press means the map, not while the map glides on under it, and not while the other
  //  players move.
  private hover(event: PointerEvent): void {
    const subject =
        event.pointerType === 'mouse' &&
        event.buttons === 0 &&
        this.#inertiaFrame === null &&
        !this.#waiting
          ? this.#subjectAt(...this.toCanvas(event.offsetX, event.offsetY))
          : null,
      current = this.#hover;

    // Still the same: wait on, or leave it open. Unless something else has closed it since (a list scrolling), which
    //  resting here opens again.
    if (
      subject !== null &&
      current !== null &&
      subject.key === current.key &&
      (current.timer !== null || tooltipOpenOver(this.canvas()))
    ) {
      Object.assign(current, {
        offsetX: event.offsetX,
        offsetY: event.offsetY,
        clientX: event.clientX,
        clientY: event.clientY,
      });

      return;
    }

    this.endHover();

    if (subject === null) {
      return;
    }

    const hover: Hover = {
      key: subject.key,
      tile: subject.tile,
      offsetX: event.offsetX,
      offsetY: event.offsetY,
      clientX: event.clientX,
      clientY: event.clientY,
      timer: null,
    };

    hover.timer = window.setTimeout(() => {
      hover.timer = null;

      this.showHover(hover);
    }, HOVER_TOOLTIP_DELAY);

    this.#hover = hover;

    // A key, while it waits or once it's open: it may move the map, or open a window over it.
    document.addEventListener('keydown', this.endHover, true);
  }

  // Opens the tooltip for what's under the mouse now, or ends the hover: a window may have opened over the map while it
  //  waited, and what it's about may have changed, or moved.
  private showHover(hover: Hover): void {
    const now =
      document.elementFromPoint(hover.clientX, hover.clientY) === this.canvas()
        ? this.#subjectAt(...this.toCanvas(hover.offsetX, hover.offsetY))
        : null;

    if (now === null || now.key !== hover.key) {
      this.endHover();

      return;
    }

    const canvas = this.canvas().getBoundingClientRect(),
      { content } = now,
      // The canvas's px to the page's, as it may be shown smaller (#1063).
      box = this.toPage(now.box);

    hover.tile = now.tile;

    showTooltipOver(
      this.canvas(),
      () => ({
        left: canvas.left + box.x,
        top: canvas.top + box.y,
        bottom: canvas.top + box.y + box.height,
      }),
      content
    );
  }

  // The square an open tooltip is about has changed: it says what's there now, and moves with its banner, or goes.
  override build(updatedTiles: Tile[]): void {
    super.build(updatedTiles);

    const hover = this.#hover;

    if (
      hover !== null &&
      hover.timer === null &&
      tooltipOpenOver(this.canvas()) &&
      updatedTiles.some(({ x, y }) => x === hover.tile.x && y === hover.tile.y)
    ) {
      this.showHover(hover);
    }
  }

  private endHover = (): void => {
    if (this.#hover?.timer) {
      window.clearTimeout(this.#hover.timer);
    }

    this.#hover = null;

    document.removeEventListener('keydown', this.endHover, true);

    if (tooltipOpenOver(this.canvas())) {
      hideTooltip();
    }
  };

  private clearTimeout() {
    if (this.#showActionMenuTimeout === null) {
      return;
    }

    window.clearTimeout(this.#showActionMenuTimeout);

    this.#showActionMenuTimeout = null;
  }

  /** Carry on moving the map at `velocity` px per ms, slowing as it goes. */
  private glide(velocity: { x: number; y: number }): void {
    this.stopGlide();

    const speed = Math.hypot(velocity.x, velocity.y),
      limit = speed > INERTIA_MAX_SPEED ? INERTIA_MAX_SPEED / speed : 1;

    let velocityX = velocity.x * limit,
      velocityY = velocity.y * limit,
      last: number | null = null;

    const step = (now: number) => {
      const elapsed = last === null ? 16 : Math.min(now - last, 64);

      last = now;

      if (Math.hypot(velocityX, velocityY) < INERTIA_MIN_SPEED) {
        this.#inertiaFrame = null;

        return;
      }

      this.scrollBy(
        ...this.toCanvas(-velocityX * elapsed, -velocityY * elapsed)
      );

      const decay = Math.pow(INERTIA_FRICTION, elapsed / 16);

      velocityX *= decay;
      velocityY *= decay;

      this.#inertiaFrame = window.requestAnimationFrame(step);
    };

    this.#inertiaFrame = window.requestAnimationFrame(step);
  }

  private stopGlide(): void {
    if (this.#inertiaFrame === null) {
      return;
    }

    window.cancelAnimationFrame(this.#inertiaFrame);

    this.#inertiaFrame = null;
  }

  setActiveUnit(unit: Unit | null = null) {
    this.#activeUnit = unit;
  }

  override setCenter(x: number, y: number): void {
    // Anything that asks for a particular tile — a unit becoming active, a
    // click on the minimap — wins over a glide that was heading elsewhere.
    this.stopGlide();

    super.setCenter(x, y);
  }
}

export default GamePortal;
