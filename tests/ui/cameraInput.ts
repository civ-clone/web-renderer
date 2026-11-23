// The 3D map's camera moved by the mouse, the wheel, a trackpad and touch (docs/3d-renderer.md §9.1, plan 1.2), on a
//  canvas of its own:
//  - a drag keeps the ground under the pointer, a press that doesn't move is left as a click, and a flick glides on,
//    unless the player has asked for less motion;
//  - the middle button, or Alt, turns and tilts; the right button is left to the unit's menu;
//  - the wheel zooms about the pointer, keeping the ground under it, even where the view looks down further as it does
//    (#1316);
//  - two fingers pinch, twist and tilt, and so do Safari's trackpad gestures;
//  - taken down, it hears nothing more.

import { Orbit, ZOOM_STEP, groundAt } from '@civ-clone/ui-map-3d/camera/orbit';
import CameraInput from '@civ-clone/ui-map-3d/camera/CameraInput';

const failures: string[] = [];
let checks = 0;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${description}\n    expected: ${JSON.stringify(
        expected
      )}\n    actual:   ${JSON.stringify(actual)}`
    );
  }
};

// The frames a glide asks for and the timers a held press sets, run by hand, and whether the player has asked for less
//  motion.
const frames = new Map<number, (now: number) => void>(),
  timers = new Map<number, () => void>();
let nextFrame = 1,
  nextTimer = 1,
  lessMotion = false;

Object.assign(globalThis, {
  window: {
    requestAnimationFrame: (callback: (now: number) => void): number => {
      frames.set(nextFrame, callback);

      return nextFrame++;
    },
    cancelAnimationFrame: (frame: number): void => void frames.delete(frame),
    setTimeout: (callback: () => void): number => {
      timers.set(nextTimer, callback);

      return nextTimer++;
    },
    clearTimeout: (timer: number): void => void timers.delete(timer),
    matchMedia: () => ({ matches: lessMotion }),
  },
});

const runFrames = (count: number, from = 1000): void => {
  for (let n = 0; n < count; n++) {
    const waiting = [...frames.values()];

    frames.clear();
    waiting.forEach((callback) => callback(from + n * 16));
  }
};

// A canvas 800 by 600 px at the page's corner, whose listeners are called by hand.
const listeners = new Map<string, EventListener[]>(),
  canvas = {
    clientWidth: 800,
    clientHeight: 600,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    setPointerCapture: () => {},
    addEventListener: (type: string, listener: EventListener) =>
      listeners.set(type, [...(listeners.get(type) ?? []), listener]),
    removeEventListener: (type: string, listener: EventListener) =>
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((each) => each !== listener)
      ),
  } as unknown as HTMLCanvasElement,
  fire = (type: string, event: object): void =>
    (listeners.get(type) ?? []).forEach((listener) =>
      listener({ preventDefault: () => {}, ...event } as unknown as Event)
    ),
  pointer = (
    type: string,
    clientX: number,
    clientY: number,
    {
      button = 0,
      pointerId = 1,
      isPrimary = true,
      pointerType = 'mouse',
      altKey = false,
      timeStamp = 0,
      buttons = 0,
    }: {
      button?: number;
      pointerId?: number;
      isPrimary?: boolean;
      pointerType?: string;
      altKey?: boolean;
      timeStamp?: number;
      buttons?: number;
    } = {}
  ): void =>
    fire(type, {
      clientX,
      clientY,
      button,
      pointerId,
      isPrimary,
      pointerType,
      altKey,
      timeStamp,
      buttons,
    });

const start: Orbit = {
    focus: [30, 20],
    yaw: 0.4,
    pitch: 0.9,
    distance: 24,
  },
  height = 0.1;

// How the view keeps the camera as it's put, which the wheel asks before it moves the focus: as asked, or, drawn back,
//  looking down further, as the 3D map does (`lowestPitch`).
let settle = (next: Orbit): Orbit => next;

let orbit: Orbit = start,
  menuOnRightClick = false,
  menuOpen = false;

// What presses that don't move did: clicks, and menus held (`hold`) or right-clicked (`right`), where they were; and
//  where the mouse rested, or `none`.
const presses: string[] = [],
  hovers: string[] = [],
  input = new CameraInput(
    canvas,
    {
      orbit: () => orbit,
      lookHeight: () => height,
      setOrbit: (next) => {
        orbit = next;
      },
      settle: (next) => settle(next),
    },
    {
      click: (x, y) => void presses.push(`click ${x},${y}`),
      menu: (x, y, clientX, clientY, pressed) => {
        presses.push(`${pressed ? 'hold' : 'right'} ${x},${y}`);

        return true;
      },
      menuOnRightClick: () => menuOnRightClick,
      menuOpen: () => menuOpen,
      hover: (at) => void hovers.push(at === null ? 'none' : `${at.x},${at.y}`),
    }
  ),
  runTimers = (): void => {
    const waiting = [...timers.values()];

    timers.clear();
    waiting.forEach((callback) => callback());
  },
  screen = (x: number, y: number): [number, number] => [
    (x / 800) * 2 - 1,
    1 - (y / 600) * 2,
  ],
  near = (a: number, b: number, within = 1e-6): boolean =>
    Math.abs(a - b) < within,
  sameGround = (
    a: readonly [number, number] | null,
    b: readonly [number, number] | null
  ): boolean =>
    a !== null &&
    b !== null &&
    near(a[0], b[0], 1e-6) &&
    near(a[1], b[1], 1e-6);

// The mouse moving with no button held: what's under it; with a button held, or a finger, nothing; leaving the map, or
//  pressing, the hover ends.
pointer('pointermove', 120, 80);
pointer('pointermove', 130, 80, { buttons: 1 });
pointer('pointermove', 140, 80, { pointerType: 'touch' });
fire('pointerleave', {});

expect(
  'the mouse resting over the map is a hover; with a button held, or a finger, it isn’t; leaving the map ends it',
  hovers.splice(0),
  ['120,80', 'none']
);

// A press that doesn't move: a click, which moves nothing.
pointer('pointerdown', 400, 300);
pointer('pointermove', 403, 302);
pointer('pointerup', 403, 302);

expect(
  'a press that moves less than a drag is a click where it was let go, and moves nothing, and ends a hover',
  [orbit === start, input.dragging(), presses.splice(0), hovers.splice(0)],
  [true, false, ['click 403,302'], ['none']]
);

// Held still: the unit's menu, and then not a click. Moved first: neither.
pointer('pointerdown', 200, 100);
runTimers();
pointer('pointerup', 200, 100);

const held = presses.splice(0);

pointer('pointerdown', 200, 100);
pointer('pointermove', 260, 100);
runTimers();
pointer('pointerup', 260, 100);

expect(
  'a press held still is the unit’s menu, not a click; one dragged first is neither',
  [held, presses.splice(0)],
  [['hold 200,100'], []]
);

orbit = start;

// A right-click: the menu, where the interface opens it with one; else the browser's own.
let prevented = false;

fire('contextmenu', {
  clientX: 50,
  clientY: 60,
  preventDefault: () => {
    prevented = true;
  },
});

const browsers = [presses.splice(0), prevented];

menuOnRightClick = true;
fire('contextmenu', {
  clientX: 50,
  clientY: 60,
  preventDefault: () => {
    prevented = true;
  },
});

expect(
  'a right-click is the unit’s menu where the interface says, and not the browser’s; elsewhere it’s left to the browser',
  [browsers, presses.splice(0), prevented],
  [[[], false], ['right 50,60'], true]
);

// A touch's `contextmenu` after the hold that opened a menu: that menu stays.
menuOpen = true;
fire('contextmenu', { clientX: 50, clientY: 60 });
menuOpen = false;

expect(
  'one arriving over a menu already open leaves it',
  presses.splice(0),
  []
);

// A drag: the ground under the pointer stays under it.
const under = groundAt(start, height, screen(300, 400), 4 / 3);

pointer('pointerdown', 300, 400, { timeStamp: 0 });
pointer('pointermove', 350, 380, { timeStamp: 100 });
pointer('pointermove', 420, 350, { timeStamp: 200 });

expect(
  'a drag keeps the ground under the pointer, and is a drag',
  [
    sameGround(groundAt(orbit, height, screen(420, 350), 4 / 3), under),
    input.dragging(),
  ],
  [true, true]
);

// Let go still: no glide. A flick: it glides on, slowing.
const stillAt = orbit;

pointer('pointerup', 420, 350, { timeStamp: 900 });
runFrames(1);

expect('let go still, it stays', [frames.size, orbit === stillAt], [0, true]);

const pressedAt = orbit;

pointer('pointerdown', 300, 300, { timeStamp: 1000 });
pointer('pointermove', 320, 300, { timeStamp: 1010 });
pointer('pointermove', 360, 300, { timeStamp: 1030 });

const flicked = orbit;

pointer('pointerup', 360, 300, { timeStamp: 1040 });
runFrames(3);

// The way the drag moved the camera's focus, and the way the glide went on moving it.
const dragged = [
    flicked.focus[0] - pressedAt.focus[0],
    flicked.focus[1] - pressedAt.focus[1],
  ],
  glided = [
    orbit.focus[0] - flicked.focus[0],
    orbit.focus[1] - flicked.focus[1],
  ];

expect(
  'a flick glides on, the way it was going, and the camera is moving meanwhile',
  [
    frames.size > 0,
    (dragged[0] ?? 0) * (glided[0] ?? 0) +
      (dragged[1] ?? 0) * (glided[1] ?? 0) >
      0,
    input.moving(),
  ],
  [true, true, true]
);

pointer('pointerdown', 300, 300, { timeStamp: 2000 });
pointer('pointerup', 300, 300, { timeStamp: 2001 });

expect(
  'catching it stops the glide, and the camera',
  [frames.size, input.moving()],
  [0, false]
);

lessMotion = true;
pointer('pointerdown', 300, 300, { timeStamp: 3000 });
pointer('pointermove', 320, 300, { timeStamp: 3010 });
pointer('pointermove', 360, 300, { timeStamp: 3030 });
pointer('pointerup', 360, 300, { timeStamp: 3040 });

expect(
  'asked for less motion, a flick stops where it is let go',
  frames.size,
  0
);

lessMotion = false;

// The middle button turns and tilts; so does the main button with Alt; the right button is left alone.
orbit = start;
pointer('pointerdown', 400, 300, { button: 1 });
pointer('pointermove', 500, 350, { button: 1 });
pointer('pointerup', 500, 350, { button: 1 });

const middle = orbit;

orbit = start;
pointer('pointerdown', 400, 300, { altKey: true });
pointer('pointermove', 500, 350, { altKey: true });
pointer('pointerup', 500, 350, { altKey: true });

const alt = orbit;

orbit = start;
pointer('pointerdown', 400, 300, { button: 2 });
pointer('pointermove', 500, 350, { button: 2 });
pointer('pointerup', 500, 350, { button: 2 });

expect(
  'dragged across, the middle button turns the view; down, it tilts it; Alt and the main button do the same; the right button does nothing',
  [
    Math.sin(middle.yaw - start.yaw) < 0,
    middle.pitch > start.pitch,
    middle.focus === start.focus,
    alt.yaw === middle.yaw && alt.pitch === middle.pitch,
    orbit === start,
  ],
  [true, true, true, true, true]
);

// The wheel: in a step, about the pointer.
orbit = start;

const wheelUnder = groundAt(start, height, screen(600, 450), 4 / 3);

fire('wheel', {
  deltaMode: 0,
  deltaY: -120,
  ctrlKey: false,
  timeStamp: 5000,
  clientX: 600,
  clientY: 450,
});

expect(
  'the wheel turned away zooms in a step, and the ground under the pointer stays under it',
  [
    near(orbit.distance, start.distance / ZOOM_STEP),
    sameGround(groundAt(orbit, height, screen(600, 450), 4 / 3), wheelUnder),
  ],
  [true, true]
);

// The wheel turned towards the player, where the view looks down further as the camera draws back: the ground under the
//  pointer still stays under it.
orbit = start;
settle = (next) => ({
  ...next,
  pitch: Math.max(next.pitch, next.distance > start.distance ? 1.1 : 0),
});

fire('wheel', {
  deltaMode: 0,
  deltaY: 120,
  ctrlKey: false,
  timeStamp: 9000,
  clientX: 600,
  clientY: 450,
});

expect(
  'the wheel turned towards the player zooms out a step, looking down further where the view does so, and the ground under the pointer stays under it',
  [
    near(orbit.distance, start.distance * ZOOM_STEP),
    near(orbit.pitch, 1.1),
    sameGround(groundAt(orbit, height, screen(600, 450), 4 / 3), wheelUnder),
  ],
  [true, true, true]
);

settle = (next) => next;

// Two fingers: spread twice as far apart, twisted a quarter turn, and moved down together.
orbit = start;

const touch = { pointerType: 'touch' };

pointer('pointerdown', 300, 300, { ...touch, pointerId: 11 });
pointer('pointerdown', 500, 300, { ...touch, pointerId: 12, isPrimary: false });
pointer('pointermove', 400, 200, { ...touch, pointerId: 11 });
pointer('pointermove', 400, 600, { ...touch, pointerId: 12, isPrimary: false });

expect(
  'two fingers spread twice as far apart halve the distance, twisted a quarter turn they turn the view, and moved down they tilt it',
  [
    near(orbit.distance, start.distance / 2),
    near(Math.cos(orbit.yaw - (start.yaw - Math.PI / 2)), 1, 1e-9),
    orbit.pitch > start.pitch,
    input.dragging(),
  ],
  [true, true, true, false]
);

// On iOS a touch screen's pinch also comes as gestures: the fingers' tilt isn't undone by them.
const tilted = orbit;

fire('gesturestart', { scale: 1, rotation: 0, timeStamp: 5500 });
fire('gesturechange', { scale: 1.2, rotation: 5, timeStamp: 5510 });

expect(
  'on iOS, the gestures that come with two fingers leave the camera to the fingers',
  orbit === tilted,
  true
);

fire('gestureend', { scale: 1.2, rotation: 5, timeStamp: 5520 });

// A third finger down, and one of the first two lifted: the two left carry the pinch on from where the camera is, with
//  no jump, and spread apart they zoom from there.
const pinched = orbit;

pointer('pointerdown', 700, 500, { ...touch, pointerId: 13, isPrimary: false });
pointer('pointerup', 400, 200, { ...touch, pointerId: 11 });
pointer('pointermove', 700, 500, { ...touch, pointerId: 13, isPrimary: false });

const handedOn = orbit;

pointer('pointermove', 1000, 400, {
  ...touch,
  pointerId: 13,
  isPrimary: false,
});

expect(
  'with a third finger, the two left after one lifts carry the pinch on from where the camera is',
  [
    near(handedOn.distance, pinched.distance),
    near(Math.cos(handedOn.yaw - pinched.yaw), 1, 1e-9),
    near(handedOn.pitch, pinched.pitch),
    orbit.distance < pinched.distance,
  ],
  [true, true, true, true]
);

pointer('pointerup', 1000, 400, { ...touch, pointerId: 13, isPrimary: false });
pointer('pointerup', 400, 600, { ...touch, pointerId: 12, isPrimary: false });

// Safari's trackpad: pinched out twice as far and twisted 30°.
orbit = start;
fire('gesturestart', { scale: 1, rotation: 0, timeStamp: 6000 });
fire('gesturechange', { scale: 2, rotation: 30, timeStamp: 6010 });
fire('gestureend', { scale: 2, rotation: 30, timeStamp: 6020 });

expect(
  "Safari's pinch halves the distance as the fingers spread twice as far, and its twist turns the view",
  [
    near(orbit.distance, start.distance / 2),
    near(Math.cos(orbit.yaw - (start.yaw - Math.PI / 6)), 1, 1e-9),
  ],
  [true, true]
);

// Taken down.
input.dispose();
orbit = start;
pointer('pointerdown', 300, 300);
pointer('pointermove', 400, 300);
fire('wheel', {
  deltaMode: 0,
  deltaY: -120,
  ctrlKey: false,
  timeStamp: 9000,
  clientX: 400,
  clientY: 300,
});

expect(
  'taken down, it hears nothing more',
  [orbit === start, [...listeners.values()].every((list) => list.length === 0)],
  [true, true]
);

if (failures.length > 0) {
  process.stderr.write(
    `FAIL cameraInput: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS cameraInput (${checks} checks)\n`);
