import { DragSample, releaseVelocity } from '@civ-clone/ui-widgets/lib/drag';
import { Coordinate, Tile, Unit } from '@civ-clone/ui-protocol/types';
import {
  TooltipContent,
  hideTooltip,
  showTooltipOver,
  tooltipOpenOver,
} from '@civ-clone/ui-component-tooltip/Tooltip';
import cityBannerTooltip, { hasBannerTooltip } from './Map/cityBannerTooltip';
import squareTooltip, { hasSquareTooltip } from './Map/squareTooltip';
import { hasFeature } from '@civ-clone/ui-client/lib/interfaceMode';
import { openUnitSelection } from './choices';
import { instance as options } from '@civ-clone/ui-client/GameOptionsRegistry';
import Portal from '@civ-clone/ui-map/components/Portal';
import { Rect } from '@civ-clone/ui-map/lib/viewport';
import UnitActionMenu from './UnitActionMenu';
import openUnitMenu from './UiUnitMenu';
import { openMenu } from './UiMenu';
import { on } from '@dom111/element';

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
  HOVER_TOOLTIP_DELAY = 400;

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

export class GamePortal extends Portal {
  #activeUnit: Unit | null = null;
  #drag: Drag | null = null;
  #hover: Hover | null = null;
  #inertiaFrame: number | null = null;
  #showActionMenuTimeout: number | null = null;
  #waiting = false;

  protected bindEvents(): void {
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
        this.glide(releaseVelocity(drag.samples, event.timeStamp));

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

      const tile = this.tileAt(event.offsetX, event.offsetY),
        // A city's banner hangs past its square, over its neighbours (#747).
        bannerCity = this.cityAt(event.offsetX, event.offsetY);

      if (tile !== null) {
        this.emit('tile-clicked', tile.x, tile.y);
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

        // The shared menu over the press, which a finger slides onto and lifts from (#808).
        if (hasFeature('sharedMenus')) {
          openUnitMenu(x, y, this.#activeUnit as Unit, tile, this.transport(), {
            pressed: true,
          });

          return;
        }

        new UnitActionMenu(
          this,
          x,
          y,
          this.#activeUnit as Unit,
          tile,
          this.transport()
        );
      }, 350);
    };

    // A right-click opens the same menu at once, without the hold, in place of the browser's own (#808).
    on(this.canvas(), 'contextmenu', (event) => {
      if (!hasFeature('sharedMenus')) {
        return;
      }

      event.preventDefault();

      // One a long press has already opened: a touch's `contextmenu` arrives after the hold that opened it.
      if (openMenu() !== null) {
        return;
      }

      const tile = this.tileAt(event.offsetX, event.offsetY);

      // Nothing to offer: the press is left as it was, a tap or a drag.
      if (tile === null || this.#activeUnit === null) {
        return;
      }

      this.clearTimeout();
      this.#drag = null;
      this.endHover();

      openUnitMenu(
        event.clientX,
        event.clientY,
        this.#activeUnit,
        tile,
        this.transport()
      );
    });

    // Prevent dragging address bar down by accident
    on(this.canvas(), 'touchstart', (event) => event.preventDefault());

    on(this.canvas(), 'pointerdown', (event) => {
      event.preventDefault();

      this.endHover();

      if (!event.isPrimary) {
        return;
      }

      // A right-click is the shared menu's (#808), not a press on the map: some browsers send its
      //  `contextmenu` only once the button is up, which would otherwise be a click on the square first.
      if (event.button === 2 && hasFeature('sharedMenus')) {
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

      const tile = this.tileAt(event.offsetX, event.offsetY);

      if (tile !== null) {
        showActionMenu(tile, event.x, event.y);
      }
    });

    on(this.canvas(), 'pointermove', (event) => {
      const drag = this.#drag;

      // No tooltip over an open menu (#808).
      if (drag === null && openMenu() !== null) {
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

      // The map follows the pointer, so the view moves the opposite way.
      this.scrollBy(drag.lastX - event.clientX, drag.lastY - event.clientY);

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
          ? this.#subjectAt(event.offsetX, event.offsetY)
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
        ? this.#subjectAt(hover.offsetX, hover.offsetY)
        : null;

    if (now === null || now.key !== hover.key) {
      this.endHover();

      return;
    }

    const canvas = this.canvas().getBoundingClientRect(),
      { box, content } = now;

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
  build(updatedTiles: Tile[]): void {
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

      this.scrollBy(-velocityX * elapsed, -velocityY * elapsed);

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

  setCenter(x: number, y: number): void {
    // Anything that asks for a particular tile — a unit becoming active, a
    // click on the minimap — wins over a glide that was heading elsewhere.
    this.stopGlide();

    super.setCenter(x, y);
  }
}

export default GamePortal;
