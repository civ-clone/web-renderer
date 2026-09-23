import { DragSample, releaseVelocity } from '../lib/drag';
import { Tile, Unit } from '../types';
import City from './City';
import UnitSelectionWindow from './UnitSelectionWindow';
import Portal from './Portal';
import UnitActionMenu from './UnitActionMenu';
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
  INERTIA_MAX_SPEED = 3;

type Drag = {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  dragging: boolean;
  samples: DragSample[];
};

export class GamePortal extends Portal {
  #activeUnit: Unit | null = null;
  #drag: Drag | null = null;
  #inertiaFrame: number | null = null;
  #showActionMenuTimeout: number | null = null;

  protected bindEvents(): void {
    on(this.canvas(), 'pointerup', (event) => {
      // Only the primary pointer drives the map: a second finger landing or
      // lifting mid-gesture must not end the first finger's drag, or count as
      // a click of its own.
      if (!event.isPrimary) {
        return;
      }

      const drag = this.#drag;

      this.#drag = null;

      if (drag !== null && drag.dragging) {
        this.glide(releaseVelocity(drag.samples, event.timeStamp));

        return;
      }

      const realTarget = document.elementFromPoint(event.pageX, event.pageY);

      if (realTarget?.matches('.unit-actions *')) {
        return;
      }

      this.clearTimeout();

      const tile = this.tileAt(event.offsetX, event.offsetY),
        playerTileUnits = tile.units.filter(
          (unit: Unit) => unit.player.id === this.playerId()
        );

      if (tile.city && tile.city.player.id === this.playerId()) {
        new City(tile.city, this, this.transport());
      } else if (playerTileUnits.length) {
        new UnitSelectionWindow(
          playerTileUnits,
          this.transport(),
          (unit: Unit) => this.emit('activate-unit', unit)
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

    // Prevent dragging address bar down by accident
    on(this.canvas(), 'touchstart', (event) => event.preventDefault());

    on(this.canvas(), 'pointerdown', (event) => {
      event.preventDefault();

      if (!event.isPrimary) {
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

      showActionMenu(
        this.tileAt(event.offsetX, event.offsetY),
        event.x,
        event.y
      );
    });

    on(this.canvas(), 'pointermove', (event) => {
      const drag = this.#drag;

      if (drag === null || drag.pointerId !== event.pointerId) {
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

        // Keep the drag going when the pointer leaves the canvas, over the
        // sidebar or off the window, until it is let go.
        this.canvas().setPointerCapture(event.pointerId);
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
