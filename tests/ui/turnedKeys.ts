// The keys that move a unit turn with a map that turns (the 3D map's camera), so up is still up the screen: on each
//  grid, unturned they're the 2D map's own, and turned each points the way it says on the screen.

import { document } from './lib/dom';
import './lib/interfaces';
import './lib/classicInterface';

import ActiveUnitController from '@civ-clone/ui-game/ActiveUnitController';
import HaltedUnits from '@civ-clone/ui-client/lib/haltedUnits';
import PendingMove from '@civ-clone/ui-client/lib/PendingMove';
import topologyFor, {
  Direction,
  TopologyName,
} from '@civ-clone/ui-client/lib/topologyFor';
import {
  MapHeading,
  directionKeys,
  movingKeys,
  turnedDirectionKeys,
} from '@civ-clone/ui-client/lib/unitActionKeys';
import { groundLayoutFor } from '@civ-clone/ui-map-3d/layouts';
import { presets, toScreen } from '@civ-clone/ui-map-3d/camera/orbit';
import { TransportHandledAction } from '@civ-clone/ui-protocol/Transport';
import { Tile } from '@civ-clone/ui-protocol/types';

void document;

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

// The way each key points on the screen, right and up, as the player reads it.
const keyPoints: { [key: string]: [number, number] } = {
  ArrowUp: [0, 1],
  PageUp: [1, 1],
  ArrowRight: [1, 0],
  PageDown: [1, -1],
  ArrowDown: [0, -1],
  End: [-1, -1],
  ArrowLeft: [-1, 0],
  Home: [-1, 1],
};

const degrees = (radians: number): number => (radians * 180) / Math.PI,
  // The angle between two ways, from none to 180°.
  apart = ([a, b]: [number, number], [c, d]: [number, number]): number =>
    Math.abs(degrees(Math.atan2(a * d - b * c, a * c + b * d)));

const grids: [TopologyName, number, number][] = [
  ['square', 12, 10],
  ['staggered-iso', 12, 10],
  ['hex-odd-r', 12, 10],
];

grids.forEach(([topologyId, width, height]) => {
  const topology = topologyFor({ topologyId, width, height }),
    layout = groundLayoutFor({
      topologyId,
      width,
      height,
      wrapsY: topology.wrapsY(),
    }),
    // Taken as the 3D map takes it: from the middle of a square to its neighbour's, on the land as it's laid out.
    at = (x: number, y: number, direction: Direction): [number, number] => {
      const [dx, dy] = topology.offset(direction, x, y),
        [u, v] = layout.centre(x, y),
        [toU, toV] = layout.centre(x + dx, y + dy);

      return [toU - u, toV - v];
    },
    headingAt = (turn: number): MapHeading => ({
      turn,
      directions: Object.fromEntries(
        topology
          .directions()
          .map((direction) => [direction, at(0, 0, direction)])
      ),
    }),
    unturned = directionKeys(topology);

  expect(
    `${topologyId}: unturned, or turned all the way round, the keys are the 2D map's own`,
    [
      turnedDirectionKeys(unturned, headingAt(0)),
      turnedDirectionKeys(unturned, headingAt(2 * Math.PI)),
      movingKeys(topology, null),
    ],
    [unturned, unturned, unturned]
  );

  // Turned every 2.5°, the eighths, the twelfths and the turns half way between them among them, seen from the camera
  //  as it is by default (its pitch) at that turn, on even and odd rows: each key moves the unit to a neighbour that's
  //  that way on the screen, every key that moves a unit unturned still does, and every way the grid has has a key.
  const faults: string[] = [];

  for (let step = 0; step < 144; step++) {
    const turn = (step * 2.5 * Math.PI) / 180,
      keys = turnedDirectionKeys(unturned, headingAt(turn));

    [
      [4, 4],
      [5, 5],
    ].forEach(([x, y]) => {
      const [u, v] = layout.centre(x!, y!),
        // Looking at the square, as the camera does at the active unit.
        orbit = {
          focus: [u, v] as const,
          yaw: turn,
          pitch: presets.classic.pitch,
          distance: 12,
        },
        here = toScreen(orbit, 0, [u, 0, v], 1);

      Object.entries(keys).forEach(([key, direction]) => {
        const [dx, dy] = topology.offset(direction, x!, y!),
          [toU, toV] = layout.centre(x! + dx, y! + dy),
          there = toScreen(orbit, 0, [toU, 0, toV], 1);

        if (here === null || there === null) {
          faults.push(`${step * 2.5}°: ${key} off the screen`);

          return;
        }

        const off = apart(keyPoints[key]!, [
          there[0] - here[0],
          there[1] - here[1],
        ]);

        // The nearest way the grid has to the key's: within half the angle between two of its ways (22.5° on the
        //  square and isometric grids, 30° on the hex), and a little more as it looks with the camera leaning.
        if (off > 180 / topology.directions().length + 5) {
          faults.push(
            `${
              step * 2.5
            }° at (${x}, ${y}): ${key} moves ${direction}, ${Math.round(
              off
            )}° from its way on the screen`
          );
        }
      });
    });

    const missing = topology
        .directions()
        .filter((direction) => !Object.values(keys).includes(direction)),
      // Every key that moves a unit unturned still does.
      dropped = Object.keys(unturned).filter((key) => !(key in keys));

    if (dropped.length > 0) {
      faults.push(`${step * 2.5}°: ${dropped.join(', ')} move nothing`);
    }

    if (missing.length > 0) {
      faults.push(`${step * 2.5}°: no key moves ${missing.join(', ')}`);
    }

    // Where the grid has a direction for each key, each key has one of its own.
    if (
      topology.directions().length === 8 &&
      new Set(Object.values(keys)).size !== 8
    ) {
      faults.push(`${step * 2.5}°: two keys move the same way`);
    }
  }

  expect(
    `${topologyId}: turned any way, each key moves a unit to a neighbour that's that way on the screen, each that moved one still does, and every way has a key`,
    faults,
    []
  );
});

// A quarter turn clockwise, seen from above, on the square grid: east is up the screen.
{
  const square = topologyFor({ topologyId: 'square', width: 12, height: 10 }),
    heading: MapHeading = {
      turn: Math.PI / 2,
      directions: {
        n: [0, -1],
        ne: [1, -1],
        e: [1, 0],
        se: [1, 1],
        s: [0, 1],
        sw: [-1, 1],
        w: [-1, 0],
        nw: [-1, -1],
      },
    };

  expect(
    'turned a quarter clockwise, up moves a unit east, right south, down west, left north',
    movingKeys(square, heading),
    {
      ArrowUp: 'e',
      PageUp: 'se',
      ArrowRight: 's',
      PageDown: 'sw',
      ArrowDown: 'w',
      End: 'nw',
      ArrowLeft: 'n',
      Home: 'ne',
    }
  );
}

// On a hex grid, the up and down arrows move nothing unturned, as there's no neighbour straight up or down; turned a
//  twelfth, there is, and they move the unit to it.
{
  const hex = topologyFor({ topologyId: 'hex-odd-r', width: 12, height: 10 }),
    layout = groundLayoutFor({
      topologyId: 'hex-odd-r',
      width: 12,
      height: 10,
      wrapsY: hex.wrapsY(),
    }),
    directions = Object.fromEntries(
      hex.directions().map((direction) => {
        const [dx, dy] = hex.offset(direction, 0, 0),
          [u, v] = layout.centre(0, 0),
          [toU, toV] = layout.centre(dx, dy);

        return [direction, [toU - u, toV - v] as const];
      })
    ),
    keysAt = (turn: number) =>
      turnedDirectionKeys(directionKeys(hex), { turn, directions });

  expect(
    'on a hex grid, up and down move nothing unturned or turned 5°, and turned a twelfth either way, the way that is then up and down',
    [
      [keysAt(0).ArrowUp, keysAt(0).ArrowDown],
      [keysAt(Math.PI / 36).ArrowUp, keysAt(Math.PI / 36).ArrowDown],
      [keysAt(Math.PI / 6).ArrowUp, keysAt(Math.PI / 6).ArrowDown],
      [keysAt(-Math.PI / 6).ArrowUp, keysAt(-Math.PI / 6).ArrowDown],
    ],
    [
      [undefined, undefined],
      [undefined, undefined],
      ['ne', 'sw'],
      ['nw', 'se'],
    ]
  );
}

// The game's own controller: a key moves the unit the way the map says it's turned, and the 2D map's way where the map
//  doesn't say.
{
  const tiles = [0, 1, 2].map(
      (x) => ({ x, y: 1, id: `Tile-${x}` } as unknown as Tile)
    ),
    action = (name: string, to: Tile) => ({ _: name, from: tiles[1], to }),
    settlers = {
      id: 'Settlers-1',
      _: 'Settlers',
      tile: tiles[1],
      player: { civilization: { _: 'Roman' }, treasuries: [] },
      actions: [],
      actionsForNeighbours: {
        e: [action('Move', tiles[2])],
        w: [action('Move', tiles[0])],
        // On the hex grid.
        ne: [action('Move', tiles[2])],
      },
    },
    sent: string[] = [],
    heading: { now: MapHeading | null } = { now: null },
    grid = { now: topologyFor({ width: 3, height: 3 }) },
    controllerFor = (map: object) =>
      new ActiveUnitController({
        arrivalClosed: () => {},
        data: () => ({ player: { units: [settlers] } } as any),
        haltedUnits: new HaltedUnits(),
        map: map as any,
        options: {
          get: (key: string, defaultValue: any = null) => defaultValue,
        },
        pendingMove: new PendingMove<Tile>(),
        portal: {
          isVisible: () => true,
          render: () => {},
          setCenter: () => {},
        },
        scheduleRender: () => {},
        showUnitDetails: () => {},
        transport: {
          send: ((name: string, message: TransportHandledAction) => {
            if (name === 'action') {
              sent.push(`${message.unitAction} to ${message.target}`);
            }
          }) as any,
        },
        world: {
          get: (x: number) => tiles[x]!,
          tiles: () => tiles,
          topology: () => grid.now,
        },
      }),
    turned = {
      setActiveUnit() {},
      showActiveUnit() {},
      heading: () => heading.now,
    },
    flat = { setActiveUnit() {}, showActiveUnit() {} },
    // On a game of its own each time, so no move waits for another's answer.
    press = (map: object, key: string): [boolean, string[]] => {
      const controller = controllerFor(map);

      controller.next([{ _: 'ActiveUnit', value: settlers } as any], false);

      const pressed = controller.pressKey(key);

      return [pressed, sent.splice(0)];
    };

  const flatUp = press(flat, 'ArrowUp'),
    flatRight = press(flat, 'ArrowRight'),
    unturnedUp = press(turned, 'ArrowUp');

  heading.now = {
    turn: Math.PI / 2,
    directions: {
      n: [0, -1],
      ne: [1, -1],
      e: [1, 0],
      se: [1, 1],
      s: [0, 1],
      sw: [-1, 1],
      w: [-1, 0],
      nw: [-1, -1],
    },
  };

  expect(
    'the controller moves a unit the way the map says it is turned: east for up on a map turned a quarter clockwise, west for down, and as the 2D map does where it says nothing',
    [
      flatUp,
      flatRight,
      unturnedUp,
      press(turned, 'ArrowUp'),
      press(turned, 'ArrowDown'),
    ],
    [
      // North of it there's nothing it can do: the key isn't taken.
      [false, []],
      [true, ['Move to Tile-2']],
      [false, []],
      [true, ['Move to Tile-2']],
      [true, ['Move to Tile-0']],
    ]
  );

  // On the hex grid, up moves nothing unturned, so the key isn't the unit's; turned a twelfth, it moves it.
  grid.now = topologyFor({ topologyId: 'hex-odd-r', width: 4, height: 4 });
  heading.now = null;

  const hexUnturned = press(turned, 'ArrowUp');

  heading.now = {
    turn: Math.PI / 6,
    directions: {
      ne: [Math.sqrt(3) / 2, -1.5],
      e: [Math.sqrt(3), 0],
      se: [Math.sqrt(3) / 2, 1.5],
      sw: [-Math.sqrt(3) / 2, 1.5],
      w: [-Math.sqrt(3), 0],
      nw: [-Math.sqrt(3) / 2, -1.5],
    },
  };

  expect(
    'on the hex grid, up is taken and moves a unit only once the map is turned to a neighbour up the screen',
    [hexUnturned, press(turned, 'ArrowUp')],
    [
      [false, []],
      [true, ['Move to Tile-2']],
    ]
  );
}

if (failures.length > 0) {
  process.stderr.write(
    `FAIL turnedKeys (${
      failures.length
    } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS turnedKeys (${checks} checks)\n`);
