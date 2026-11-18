// What a press, the wheel and a pinch do to a map, apart from which map (docs/3d-renderer-plan.md 0.1b): the 2D map's
//  portal (`GamePortal`) and the 3D map's camera share them, so a drag, a flick, a turn of the wheel and a pinch feel
//  the same on both. Each says what to do, in the page's px or in zoom steps: the map does it, in its own terms.
//
// Imports nothing with state, so the 3D map's own script can bundle it too.

import { DragSample, releaseVelocity } from './drag';

/** How far, in px, a press has to move before it's a drag rather than a click or a long press: enough to absorb a
 *  wobbling finger. */
export const DRAG_THRESHOLD = 8;

// How much of its speed a glide keeps after each 16ms frame.
const INERTIA_FRICTION = 0.92,
  // Below this, in px per ms, a glide is over.
  INERTIA_MIN_SPEED = 0.02,
  // A hard flick is a few px per ms. Two pointer events a millisecond apart can make a short drag look many times
  //  faster than that, and would throw the map clean across the world.
  INERTIA_MAX_SPEED = 3,
  // How far, in px, the wheel turns for a tenth of zoom (#1101), past the first turn after a pause, which makes a tenth
  //  however small: a mouse turned a notch at a time zooms a tenth a notch, whatever its browser counts a notch as (as
  //  little as a few px). A trackpad's two-finger scroll sends a few px at a time, added up until they reach this. A
  //  wheel counted in lines or pages (Firefox's mouse) makes a tenth each time it turns.
  WHEEL_STEP = 50,
  // A trackpad's pinch, which comes as the wheel with Ctrl held, sends smaller deltas still: a pinch to twice the size
  //  is about 70 px.
  PINCH_STEP = 8,
  // The most tenths a turn counted in px makes (#1139), a pinch's aside. A trackpad's flick runs on as it slows, with no
  //  pause, and would otherwise run the zoom to one end of its range: past this, the rest of it is the map's, and does
  //  nothing. A whole scale's worth, so a mouse's wheel spun fast still zooms far.
  WHEEL_TURN_TENTHS = 10;

/** Past this long, in ms, without the wheel turning, what it turned before is forgotten: a new turn starts afresh. */
export const WHEEL_PAUSE = 250;

/** What a pointer event says that a press needs. */
export type PressEvent = Pick<
  PointerEvent,
  'pointerId' | 'clientX' | 'clientY' | 'timeStamp'
>;

/**
 * A press on the map, followed until it's let go: a click, unless it moves `DRAG_THRESHOLD` px, when it's a drag, and
 *  the map follows it. Its last moments are kept, for how fast it was going when it was let go.
 */
export class Press {
  readonly pointerId: number;
  #startX: number;
  #startY: number;
  #lastX: number;
  #lastY: number;
  #dragging = false;
  #samples: DragSample[];

  constructor({ pointerId, clientX, clientY, timeStamp }: PressEvent) {
    this.pointerId = pointerId;
    this.#startX = clientX;
    this.#startY = clientY;
    this.#lastX = clientX;
    this.#lastY = clientY;
    this.#samples = [{ x: clientX, y: clientY, time: timeStamp }];
  }

  /** Whether it has moved far enough to be a drag. */
  dragging(): boolean {
    return this.#dragging;
  }

  /**
   * The pointer moved. Nothing, for another pointer or a press that hasn't moved far enough yet. Otherwise, how far to
   *  move the view in the page's px, which is the pointer's move reversed, as the map follows the pointer; and whether
   *  this move is the one that made it a drag.
   */
  move({
    pointerId,
    clientX,
    clientY,
    timeStamp,
  }: PressEvent): { dx: number; dy: number; started: boolean } | null {
    if (pointerId !== this.pointerId) {
      return null;
    }

    if (
      !this.#dragging &&
      Math.hypot(clientX - this.#startX, clientY - this.#startY) <
        DRAG_THRESHOLD
    ) {
      return null;
    }

    const started = !this.#dragging,
      dx = this.#lastX - clientX,
      dy = this.#lastY - clientY;

    this.#dragging = true;
    this.#lastX = clientX;
    this.#lastY = clientY;

    this.#samples.push({ x: clientX, y: clientY, time: timeStamp });

    // Only the tail is used to work out the release speed.
    if (this.#samples.length > 20) {
      this.#samples.shift();
    }

    return { dx, dy, started };
  }

  /** How fast it was going, in the page's px per ms, when it was let go at `timeStamp`. */
  releaseVelocity(timeStamp: number): { x: number; y: number } {
    return releaseVelocity(this.#samples, timeStamp);
  }
}

/**
 * A map let go while it was moving carries on, slowing as it goes. `move` moves the view as a drag would, in the page's
 *  px. Frames are asked of `window` as they're needed.
 */
export class Glide {
  #frame: number | null = null;
  #move: (dx: number, dy: number) => void;

  constructor(move: (dx: number, dy: number) => void) {
    this.#move = move;
  }

  /** Carries on moving at `velocity` px per ms, slowing as it goes. */
  start(velocity: { x: number; y: number }): void {
    this.stop();

    const speed = Math.hypot(velocity.x, velocity.y),
      limit = speed > INERTIA_MAX_SPEED ? INERTIA_MAX_SPEED / speed : 1;

    let velocityX = velocity.x * limit,
      velocityY = velocity.y * limit,
      last: number | null = null;

    const step = (now: number) => {
      const elapsed = last === null ? 16 : Math.min(now - last, 64);

      last = now;

      if (Math.hypot(velocityX, velocityY) < INERTIA_MIN_SPEED) {
        this.#frame = null;

        return;
      }

      this.#move(-velocityX * elapsed, -velocityY * elapsed);

      const decay = Math.pow(INERTIA_FRICTION, elapsed / 16);

      velocityX *= decay;
      velocityY *= decay;

      this.#frame = window.requestAnimationFrame(step);
    };

    this.#frame = window.requestAnimationFrame(step);
  }

  /** Whether it's still moving. */
  gliding(): boolean {
    return this.#frame !== null;
  }

  /** Stops where it is, as catching a gliding map would. */
  stop(): void {
    if (this.#frame === null) {
      return;
    }

    window.cancelAnimationFrame(this.#frame);

    this.#frame = null;
  }
}

/** What a wheel event says that a turn needs. */
export type WheelTurnEvent = Pick<
  WheelEvent,
  'deltaMode' | 'deltaY' | 'ctrlKey' | 'timeStamp'
>;

/**
 * The wheel over the map (#1101): towards the player zooms out, away zooms in, a step for each notch or each
 *  `WHEEL_STEP` (`PINCH_STEP` for a pinch) of px turned. A step is the map's own: a tenth of zoom on the 2D map.
 */
export class WheelTurn {
  // What the wheel has turned since it last made a tenth, in px, which way (-1 or 1, 0 before it has), when it last
  //  turned, and how many tenths this turn has made.
  #delta = 0;
  #direction = 0;
  #at = -Infinity;
  #tenths = 0;

  /**
   * The wheel turned: a step in (1), out (-1), or nothing (0). `pinchedAt` is when a Safari pinch last moved, if one
   *  is under way, which zooms already: Safari may send the wheel with Ctrl as well.
   */
  turned(event: WheelTurnEvent, pinchedAt: number | null): -1 | 0 | 1 {
    // Read first: Firefox counts its mouse's wheel in lines only for a page that asks how it counts before how far.
    const inPixels = event.deltaMode === 0,
      delta = event.deltaY;

    // A pinch whose end went astray (the window losing focus) stops counting once it's been still a moment.
    if (
      delta === 0 ||
      (event.ctrlKey &&
        pinchedAt !== null &&
        event.timeStamp - pinchedAt <= WHEEL_PAUSE)
    ) {
      return 0;
    }

    // Turned the other way, or after a pause: a new turn, which makes a tenth at once, and what was turned before
    //  counts for nothing.
    const direction = Math.sign(delta),
      fresh =
        event.timeStamp - this.#at > WHEEL_PAUSE ||
        direction !== this.#direction;

    this.#at = event.timeStamp;
    this.#direction = direction;

    if (fresh) {
      this.#delta = 0;
      this.#tenths = 0;
    }

    // A trackpad's flick running on past as far as a turn goes (#1139).
    if (inPixels && !event.ctrlKey && this.#tenths >= WHEEL_TURN_TENTHS) {
      return 0;
    }

    if (!fresh && inPixels) {
      this.#delta += delta;

      // One tenth at most for each turn of the wheel, however far it turned: a notch on a fast wheel is many hundreds
      //  of px.
      if (Math.abs(this.#delta) < (event.ctrlKey ? PINCH_STEP : WHEEL_STEP)) {
        return 0;
      }

      this.#delta = 0;
    }

    // Only what the cap counts.
    if (inPixels && !event.ctrlKey) {
      this.#tenths += 1;
    }

    return delta < 0 ? 1 : -1;
  }
}

/**
 * Safari's trackpad pinch (#1138), which comes as gestures, not the wheel: the zoom follows the fingers, the zoom it
 *  began at times how far they've spread. `T` is what the zoom is measured in, compared by identity: the map's art, as
 *  another set has a zoom of its own (#1118).
 */
export class Pinch<T> {
  // The zoom the fingers' spread is measured from, in what, and when the pinch last moved.
  #gesture: { from: number; measure: T; at: number } | null = null;

  /** When the pinch under way last moved, or nothing. */
  at(): number | null {
    return this.#gesture?.at ?? null;
  }

  /** A pinch begins, at the zoom `asked` for now in `measure`. */
  start(timeStamp: number, asked: number, measure: T): void {
    this.#gesture = { from: asked, measure, at: timeStamp };
  }

  end(): void {
    this.#gesture = null;
  }

  /**
   * The fingers moved, `scale` times as far apart as they began: how many steps of `step` to zoom by from the zoom
   *  `asked` for now in `measure`. `clamp` keeps a zoom within the map's range and rounds it to a whole step, as
   *  `zoomFor` does: pinched past either end, the zoom is measured from where `clamp` stopped it, so it turns back as
   *  soon as the fingers do. Nothing for a pinch that didn't begin here, or that hasn't moved a step.
   */
  change(
    { scale, timeStamp }: { scale: number; timeStamp: number },
    asked: number,
    measure: T,
    clamp: (zoom: number) => number,
    step: number
  ): number {
    const gesture = this.#gesture;

    if (gesture === null) {
      return 0;
    }

    gesture.at = timeStamp;

    // Measured in something else since it began (the map's art changed mid-pinch, #1118): afresh, from its zoom.
    if (gesture.measure !== measure) {
      gesture.measure = measure;
      gesture.from = asked / scale;

      return 0;
    }

    const wanted = gesture.from * scale,
      zoom = clamp(wanted);

    // Pinched past either end: measured from there instead, so the zoom turns back as soon as the fingers do.
    if (Math.abs(zoom - wanted) > step / 2) {
      gesture.from = zoom / scale;
    }

    return Math.round((zoom - asked) / step);
  }
}
