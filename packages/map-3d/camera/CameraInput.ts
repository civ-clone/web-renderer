// The 3D map's camera, moved by the mouse, the wheel, a trackpad and touch (docs/3d-renderer.md §9.1), on the map's
//  canvas. A press, a glide and the wheel are the 2D map's own (`@civ-clone/ui-widgets/lib/mapGestures`), so they feel
//  the same on both maps:
//  - **drag** with the main button: the ground under the pointer stays under it, and a flick glides on;
//  - **drag with the middle button, or with Alt held:** across turns the view, up and down tilts it;
//  - **the wheel,** or a trackpad's pinch, zooms about the pointer, by the 2D map's steps and pauses;
//  - **two fingers:** pinching zooms, twisting turns, and moving both up or down tilts;
//  - **Safari's trackpad gestures:** pinching zooms and twisting turns.
// A press that doesn't move is a click, and one held still a moment is the unit's menu, as is a right-click where the
//  interface opens it there (#808): the view says what they do (`CameraPresses`).

import { Glide, Press, WheelTurn } from '@civ-clone/ui-widgets/lib/mapGestures';
import prefersReducedMotion from '@civ-clone/ui-map/lib/reducedMotion';
import { Orbit, clampOrbit, groundAt, panned, zoomed } from './orbit';

/** What a press that doesn't move does: where it is in the canvas's px, and on the page. */
export type CameraPresses = {
  // A press let go where it began.
  click(x: number, y: number, clientX: number, clientY: number): void;
  // A press held still (`pressed`), or a right-click: the unit's menu. Whether it opened one: a held press that did
  //  is no longer a click.
  menu(
    x: number,
    y: number,
    clientX: number,
    clientY: number,
    pressed: boolean
  ): boolean;
  // Whether a right-click opens the menu, in place of the browser's own; and whether a menu is open already.
  menuOnRightClick(): boolean;
  menuOpen(): boolean;
  // The mouse moved over the map with no button held, while it's still: or it left the map, or a press or a glide
  //  began, where nothing's hovered (`null`).
  hover(
    at: { x: number; y: number; clientX: number; clientY: number } | null
  ): void;
};

// How long a press is held still before it's the unit's menu, as on the 2D map.
const HOLD = 350;

/** What the input asks of the view. */
export type CameraTarget = {
  // The camera now, and the height it looks at.
  orbit(): Orbit;
  lookHeight(): number;
  // Put the camera here at once, and draw it.
  setOrbit(orbit: Orbit): void;
};

// How far the view turns, and tilts, for each px dragged with the middle button.
const TURN_PER_PX = 0.006,
  TILT_PER_PX = 0.004;

/** Safari's own gesture event, which the DOM's types leave out. */
type GestureEvent = Event & {
  scale: number;
  rotation: number;
  clientX?: number;
  clientY?: number;
  timeStamp: number;
};

export class CameraInput {
  #canvas: HTMLCanvasElement;
  #target: CameraTarget;
  // A press of the main button, and where the pointer was last, in the page's px from the canvas's corner.
  #press: Press | null = null;
  #last: [number, number] = [0, 0];
  // A press of the middle button, or with Alt held: it turns and tilts.
  #turning: { pointerId: number; x: number; y: number } | null = null;
  #glide: Glide;
  #wheel = new WheelTurn();
  // Fingers down on a touch screen, by pointer, where each is now; and what two of them began at, if two are down.
  #fingers = new Map<number, [number, number]>();
  #pair: {
    distance: number;
    angle: number;
    middleY: number;
    orbit: Orbit;
  } | null = null;
  // Safari's pinch: the camera it began at, and when it last moved.
  #gesture: { orbit: Orbit; at: number } | null = null;
  #listeners: [string, EventListener, AddEventListenerOptions?][] = [];
  #presses: CameraPresses | null;
  // A press waiting to be held long enough to be the unit's menu.
  #hold: number | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    target: CameraTarget,
    presses: CameraPresses | null = null
  ) {
    this.#canvas = canvas;
    this.#target = target;
    this.#presses = presses;
    this.#glide = new Glide((dx, dy) => {
      const [x, y] = this.#middle();

      // As a drag that far: the pointer moves the other way to the view.
      this.#pan([x, y], [x - dx, y - dy]);
    });

    this.#listen('pointerdown', (event) => this.#down(event as PointerEvent));
    this.#listen('pointermove', (event) => this.#move(event as PointerEvent));
    this.#listen('pointerup', (event) => this.#up(event as PointerEvent));
    this.#listen('pointercancel', (event) =>
      this.#cancel(event as PointerEvent)
    );
    // Not passive: over the map, the wheel is the map's, and neither scrolls the page nor, with Ctrl as a pinch sends
    //  it, zooms the page.
    this.#listen('wheel', (event) => this.#wheelTurned(event as WheelEvent), {
      passive: false,
    });
    this.#listen(
      'gesturestart',
      (event) => this.#safari(event as GestureEvent, 'start'),
      { passive: false }
    );
    this.#listen(
      'gesturechange',
      (event) => this.#safari(event as GestureEvent, 'change'),
      { passive: false }
    );
    this.#listen(
      'gestureend',
      (event) => this.#safari(event as GestureEvent, 'end'),
      { passive: false }
    );
    this.#listen('contextmenu', (event) =>
      this.#rightClick(event as MouseEvent)
    );
    this.#listen('pointerleave', () => this.#presses?.hover(null));
    // A drag on a touch screen moves the map, not the page.
    this.#listen('touchstart', (event) => event.preventDefault(), {
      passive: false,
    });
  }

  /** Whether a press is being dragged: a press let go without one is a click. */
  dragging(): boolean {
    return this.#press?.dragging() === true || this.#turning !== null;
  }

  /** Whether it's moving the camera: dragged, turned, pinched, or gliding on after a flick. */
  moving(): boolean {
    return this.dragging() || this.#pair !== null || this.#glide.gliding();
  }

  /** Takes its listeners off the canvas, and stops a glide. */
  dispose(): void {
    this.#glide.stop();
    this.#stopHold();
    this.#listeners.forEach(([type, listener, options]) =>
      this.#canvas.removeEventListener(type, listener, options)
    );
    this.#listeners = [];
  }

  #listen(
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions
  ): void {
    this.#canvas.addEventListener(type, listener, options);
    this.#listeners.push([type, listener, options]);
  }

  // The canvas's box, and a point in it as the camera's maths takes a point on the screen: -1 to 1 across and up.
  #box(): { width: number; height: number } {
    return {
      width: this.#canvas.clientWidth || 1,
      height: this.#canvas.clientHeight || 1,
    };
  }

  #screen([x, y]: [number, number]): [number, number] {
    const { width, height } = this.#box();

    return [(x / width) * 2 - 1, 1 - (y / height) * 2];
  }

  #middle(): [number, number] {
    const { width, height } = this.#box();

    return [width / 2, height / 2];
  }

  #aspect(): number {
    const { width, height } = this.#box();

    return width / height;
  }

  // Where a pointer is, in the page's px from the canvas's corner.
  #at(event: { clientX: number; clientY: number }): [number, number] {
    const box = this.#canvas.getBoundingClientRect();

    return [event.clientX - box.left, event.clientY - box.top];
  }

  // The ground that was under `from` moved to be under `to`.
  #pan(from: [number, number], to: [number, number]): void {
    this.#target.setOrbit(
      panned(
        this.#target.orbit(),
        this.#target.lookHeight(),
        this.#screen(from),
        this.#screen(to),
        this.#aspect()
      )
    );
  }

  #down(event: PointerEvent): void {
    // Catching a gliding map stops it where it is.
    this.#glide.stop();
    this.#presses?.hover(null);

    if (event.pointerType === 'touch') {
      this.#fingers.set(event.pointerId, this.#at(event));

      // A second finger: no longer a drag, but a pinch, a twist and a tilt.
      if (this.#fingers.size === 2) {
        this.#press = null;
        this.#stopHold();
        this.#pair = this.#measurePair();

        return;
      }
    }

    if (!event.isPrimary) {
      return;
    }

    // The right button is the unit's menu's (#808).
    if (event.button === 2) {
      return;
    }

    this.#canvas.setPointerCapture?.(event.pointerId);

    if (event.button === 1 || (event.button === 0 && event.altKey)) {
      event.preventDefault();
      this.#turning = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };

      return;
    }

    if (event.button === 0) {
      const press = new Press(event),
        [x, y] = this.#at(event),
        { clientX, clientY } = event;

      this.#press = press;
      this.#last = [x, y];
      this.#stopHold();
      this.#hold = window.setTimeout(() => {
        this.#hold = null;

        // Held still: the unit's menu, and then not a click.
        if (
          this.#press === press &&
          !press.dragging() &&
          this.#presses?.menu(x, y, clientX, clientY, true) === true
        ) {
          this.#press = null;
        }
      }, HOLD);
    }
  }

  #stopHold(): void {
    if (this.#hold !== null) {
      window.clearTimeout(this.#hold);
      this.#hold = null;
    }
  }

  // A right-click, where the interface opens the unit's menu with it: the menu, and not the browser's own.
  #rightClick(event: MouseEvent): void {
    if (this.#presses === null || !this.#presses.menuOnRightClick()) {
      return;
    }

    event.preventDefault();

    // One a held press has already opened: a touch's `contextmenu` arrives after the hold that opened it.
    if (this.#presses.menuOpen()) {
      return;
    }

    const [x, y] = this.#at(event);

    // A menu, and then the press isn't a click; with none to open, the press is left as it was, a tap or a drag.
    if (this.#presses.menu(x, y, event.clientX, event.clientY, false)) {
      this.#stopHold();
      this.#press = null;
    }
  }

  #move(event: PointerEvent): void {
    if (this.#fingers.has(event.pointerId)) {
      this.#fingers.set(event.pointerId, this.#at(event));

      if (this.#pair !== null) {
        this.#twoFingers();

        return;
      }
    }

    const turning = this.#turning;

    if (turning !== null && turning.pointerId === event.pointerId) {
      const orbit = this.#target.orbit();

      this.#target.setOrbit(
        clampOrbit({
          ...orbit,
          yaw: orbit.yaw - (event.clientX - turning.x) * TURN_PER_PX,
          pitch: orbit.pitch + (event.clientY - turning.y) * TILT_PER_PX,
        })
      );
      turning.x = event.clientX;
      turning.y = event.clientY;

      return;
    }

    const press = this.#press;

    // The mouse, with no button held, over a map that isn't moving: what's under it.
    if (press === null) {
      if (
        event.pointerType === 'mouse' &&
        event.buttons === 0 &&
        !this.#glide.gliding()
      ) {
        const [x, y] = this.#at(event);

        this.#presses?.hover({
          x,
          y,
          clientX: event.clientX,
          clientY: event.clientY,
        });
      }

      return;
    }

    if (press.move(event) === null) {
      return;
    }

    // A drag now, not a held press.
    this.#stopHold();

    const now = this.#at(event);

    this.#pan(this.#last, now);
    this.#last = now;
  }

  #up(event: PointerEvent): void {
    this.#fingers.delete(event.pointerId);

    if (this.#pair !== null) {
      // A pinch ends with either finger: what's left is held, not dragged. With a third finger down, the two left carry
      //  it on from where the camera is, rather than from the first two's start.
      this.#pair = this.#fingers.size < 2 ? null : this.#measurePair();

      return;
    }

    if (this.#turning?.pointerId === event.pointerId) {
      this.#turning = null;

      return;
    }

    const press = this.#press;

    if (press === null || press.pointerId !== event.pointerId) {
      return;
    }

    this.#press = null;
    this.#stopHold();

    // Let go where it began: a click.
    if (!press.dragging()) {
      const [x, y] = this.#at(event);

      this.#presses?.click(x, y, event.clientX, event.clientY);

      return;
    }

    // A flick carries on, unless the player has asked for less motion (#856).
    if (!prefersReducedMotion()) {
      this.#glide.start(press.releaseVelocity(event.timeStamp));
    }
  }

  #cancel(event: PointerEvent): void {
    this.#fingers.delete(event.pointerId);

    if (this.#pair !== null) {
      this.#pair = this.#fingers.size < 2 ? null : this.#measurePair();
    }

    if (this.#press?.pointerId === event.pointerId) {
      this.#press = null;
      this.#stopHold();
    }

    if (this.#turning?.pointerId === event.pointerId) {
      this.#turning = null;
    }
  }

  // Two fingers: how far apart, at what angle, and how high their middle is, with the camera they began at.
  #measurePair(): {
    distance: number;
    angle: number;
    middleY: number;
    orbit: Orbit;
  } | null {
    const [a, b] = [...this.#fingers.values()];

    if (a === undefined || b === undefined) {
      return null;
    }

    return {
      distance: Math.max(1, Math.hypot(b[0] - a[0], b[1] - a[1])),
      angle: Math.atan2(b[1] - a[1], b[0] - a[0]),
      middleY: (a[1] + b[1]) / 2,
      orbit: this.#target.orbit(),
    };
  }

  // Spread, they zoom in; twisted, they turn the view with them; moved up or down together, they tilt it.
  #twoFingers(): void {
    const began = this.#pair,
      now = this.#measurePair();

    if (began === null || now === null) {
      return;
    }

    this.#target.setOrbit(
      clampOrbit({
        ...began.orbit,
        distance: began.orbit.distance * (began.distance / now.distance),
        yaw: began.orbit.yaw - (now.angle - began.angle),
        pitch: began.orbit.pitch + (now.middleY - began.middleY) * TILT_PER_PX,
      })
    );
  }

  // The wheel, or a trackpad's pinch, zooms about the pointer: the ground under it stays under it.
  #wheelTurned(event: WheelEvent): void {
    event.preventDefault();

    const steps = this.#wheel.turned(event, this.#gesture?.at ?? null);

    if (steps === 0) {
      return;
    }

    this.#glide.stop();
    this.#zoomAbout(steps, this.#at(event));
  }

  #zoomAbout(steps: number, pointer: [number, number]): void {
    const orbit = this.#target.orbit(),
      near = zoomed(orbit, steps),
      under = groundAt(
        orbit,
        this.#target.lookHeight(),
        this.#screen(pointer),
        this.#aspect()
      );

    // Above the horizon, or zoomed no further: about the middle.
    if (under === null || near.distance === orbit.distance) {
      this.#target.setOrbit(near);

      return;
    }

    // The focus moves towards the point as far as the camera does towards the focus, so the point stays put.
    const share = 1 - near.distance / orbit.distance;

    this.#target.setOrbit({
      ...near,
      focus: [
        orbit.focus[0] + (under[0] - orbit.focus[0]) * share,
        orbit.focus[1] + (under[1] - orbit.focus[1]) * share,
      ],
    });
  }

  // Safari's trackpad pinch and twist (#1138), which would otherwise zoom the page.
  #safari(event: GestureEvent, phase: 'start' | 'change' | 'end'): void {
    event.preventDefault();

    // A touch screen's pinch on iOS comes as gestures too, alongside the fingers this follows already: they're the
    //  fingers', or a tilt they make would be undone.
    if (this.#pair !== null) {
      this.#gesture = null;

      return;
    }

    if (phase === 'end') {
      this.#gesture = null;

      return;
    }

    if (phase === 'start') {
      this.#glide.stop();
      this.#press = null;
      this.#stopHold();
      this.#gesture = { orbit: this.#target.orbit(), at: event.timeStamp };

      return;
    }

    const gesture = this.#gesture;

    if (gesture === null) {
      return;
    }

    gesture.at = event.timeStamp;

    this.#target.setOrbit(
      clampOrbit({
        ...gesture.orbit,
        distance: gesture.orbit.distance / Math.max(0.05, event.scale),
        yaw: gesture.orbit.yaw - (event.rotation * Math.PI) / 180,
      })
    );
  }
}

export default CameraInput;
