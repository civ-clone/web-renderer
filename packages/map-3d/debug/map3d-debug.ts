// The 3D map's debug page (docs/3d-renderer-plan.md 1.1b): `dist/map3d-debug.html`, an entry of its own,
//  `dist/map3d-debug.js`. It draws a made-up world (`generateWorld.ts`) on any grid with the real 3D map, from
//  `dist/map3d.js` as a game loads it, with no game: no worker, no 2D art.
//
// What it draws comes from its address, which the form on the page sets: `grid` (`square`, `staggered-iso` or
//  `hex-odd-r`), `width`, `height`, `seed`, `seen` (how much has been seen, 0 to 1), and `x` and `y`, the square the map
//  is centred on. The arrow keys move the map two squares' width at a time, as the screen shows it; `[` and `]` turn
//  it, `\` turns it back to north, and `z` and `x` zoom in and out, as in a game.

import { MAP3D_GLOBAL, Map3DScript } from '@civ-clone/ui-map/MapView3DFactory';
import { PlayerTile, Tile } from '@civ-clone/ui-protocol/types';
import Transport from '@civ-clone/ui-client/Transport';
import World from '@civ-clone/ui-map/components/World';
import generateWorld from './generateWorld';
import pageOptions from './pageOptions';
import populate from './populate';

// The tiles, with the made-up cities and units on them.
const populated = (tiles: PlayerTile[], seed: number): PlayerTile[] => {
  populate(tiles, seed);

  return tiles;
};

// A square as the client gets it: only what the 3D map reads is filled in.
const tileAt = (x: number, y: number, terrain: string): PlayerTile => {
  const water = terrain === 'Ocean',
    tile: Tile = {
      _: 'Tile',
      __: ['Tile', 'DataObject'],
      id: `Tile-${x}--${y}`,
      city: null,
      goodyHut: null,
      improvements: [],
      isCoast: false,
      isLand: !water && terrain !== 'Unknown',
      isWater: water,
      terrain: {
        _: terrain,
        __: [terrain, 'Terrain', 'DataObject'],
        id: `${terrain}-${x}--${y}`,
        features: [],
      },
      units: [],
      workedBy: null,
      x,
      y,
      yields: [],
    };

  return { ...tile, tile } as PlayerTile;
};

// What the address keeps, changed at most every quarter of a second: Safari refuses many changes in a short time.
const waiting: { [name: string]: string } = {};
let keeping: number | null = null;

const keep = (values: { [name: string]: string }): void => {
  Object.assign(waiting, values);

  keeping ??= window.setTimeout(() => {
    const query = new URLSearchParams(location.search);

    keeping = null;
    Object.entries(waiting).forEach(([name, value]) => query.set(name, value));
    history.replaceState(null, '', `?${query}`);
  }, 250);
};

const start = (script: Map3DScript): void => {
  const options = pageOptions(location.search),
    { terrain, layout } = generateWorld(options),
    map = document.getElementById('map'),
    canvas = map?.querySelector('canvas');

  if (!map || !canvas) {
    throw new Error('The debug page has no #map canvas.');
  }

  const world = new World({
      _: 'World',
      __: ['World', 'DataObject'],
      id: 'debug-world',
      width: options.width,
      height: options.height,
      topologyId: options.topologyId,
      tiles: populated(
        terrain.flatMap((row, y) => row.map((name, x) => tileAt(x, y, name))),
        options.seed
      ),
    }),
    view = script.createMapView3D({
      activateUnit: () => {},
      art: {
        id: () => 'debug',
        nativeTileSize: () => ({ width: 16, height: 16 }),
        scale: () => 1,
        zoom: () => 1,
      },
      // Kept in the page's own address, as the centre is.
      cameraDistance: {
        get: () => options.distance,
        set: (distance) => keep({ distance: distance.toFixed(2) }),
      },
      cityOpener: { opens: () => false, open: () => {} },
      coveredBy: [],
      debug: true,
      lockVerticalEdges: true,
      mapCanvas: canvas,
      minimapCanvas: document.querySelector<HTMLCanvasElement>('#minimap'),
      playerId: 'debug',
      // No game: a click centres the map on its square, as a click on a square with nothing to open does.
      squares: {
        click: (portal, tile) => portal.setCenter(tile.x, tile.y),
        prompt: () => ({ close: () => {} }),
        menu: () => {},
        menuOnRightClick: () => false,
        menuOpen: () => false,
        tooltip: () => false,
        endTooltip: () => {},
      },
      // Nothing on the page talks to a game.
      transport: {} as Transport,
      world,
    }),
    centre = { x: options.x, y: options.y },
    // Which way each arrow moves the map on the screen: up, then right, a quarter turn at a time.
    moves: { [key: string]: number } = {
      ArrowUp: 0,
      ArrowRight: 1,
      ArrowDown: 2,
      ArrowLeft: 3,
    },
    keys: { [key: string]: () => void } = {
      '[': () => view.turnBy(-1),
      ']': () => view.turnBy(1),
      '\\': () => view.faceNorth(),
      z: () => view.zoomBy(1),
      x: () => view.zoomBy(-1),
    },
    // The camera's bearing, from the 3D view itself: the debug page knows it's that.
    yaw = (): number =>
      (view as unknown as { orbit?(): { yaw: number } }).orbit?.().yaw ?? 0,
    // The address follows the centre, so a reload or a copied link shows the same place.
    remember = (): void => keep({ x: String(centre.x), y: String(centre.y) });

  view.centre(world.get(centre.x, centre.y));

  // However the camera's moved since (dragged, glided, zoomed about the pointer, sent by the minimap): once it's come to
  //  rest, the address follows, and the arrows move on from there. Looked at four times a second.
  let last = view.portal.center();

  window.setInterval(() => {
    const now = view.portal.center(),
      resting = now.x === last.x && now.y === last.y;

    last = now;

    if (resting && (now.x !== centre.x || now.y !== centre.y)) {
      centre.x = now.x;
      centre.y = now.y;
      remember();
    }
  }, 250);

  document.addEventListener('keydown', (event) => {
    const move = moves[event.key],
      key = keys[event.key];

    if (
      (move === undefined && key === undefined) ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      (event.target instanceof HTMLElement &&
        event.target.closest('form') !== null)
    ) {
      return;
    }

    event.preventDefault();

    if (key !== undefined) {
      if (!event.repeat) {
        key();
      }

      return;
    }

    // Two squares' width that way on the screen, as the camera's turned, to the square there.
    const bearing = yaw() + ((move ?? 0) * Math.PI) / 2,
      [u, v] = layout.centre(centre.x, centre.y),
      [x, y] = layout.tileAt(
        u + Math.sin(bearing) * 2,
        v - Math.cos(bearing) * 2
      );

    centre.x = ((x % options.width) + options.width) % options.width;
    centre.y = ((y % options.height) + options.height) % options.height;
    view.centre(world.get(centre.x, centre.y));
    remember();
  });

  // The form shows what's drawn.
  const form = document.querySelector('form');

  if (form) {
    Object.entries({
      grid: options.topologyId,
      width: String(options.width),
      height: String(options.height),
      seed: String(options.seed),
      seen: String(options.seen),
    }).forEach(([name, value]) => {
      const field = form.elements.namedItem(name);

      if (
        field instanceof HTMLInputElement ||
        field instanceof HTMLSelectElement
      ) {
        field.value = value;
      }
    });
  }
};

const script = (globalThis as unknown as { [MAP3D_GLOBAL]?: Map3DScript })[
  MAP3D_GLOBAL
];

if (typeof document !== 'undefined') {
  if (script === undefined) {
    document.body.append('dist/map3d.js did not load: run the build first.');
  } else {
    // Said on the page, as there's no game to fall back to 2D: no WebGL2, say.
    try {
      start(script);
    } catch (error) {
      const said = document.createElement('p');

      said.textContent = `The 3D map couldn't start: ${String(error)}`;
      document.body.append(said);
      console.error(error);
    }
  }
}
