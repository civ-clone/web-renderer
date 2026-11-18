// The 3D map's debug page (docs/3d-renderer-plan.md 1.1b): `dist/map3d-debug.html`, an entry of its own,
//  `dist/map3d-debug.js`. It draws a made-up world (`generateWorld.ts`) on any grid with the real 3D map, from
//  `dist/map3d.js` as a game loads it, with no game: no worker, no 2D art.
//
// What it draws comes from its address, which the form on the page sets: `grid` (`square`, `staggered-iso` or
//  `hex-odd-r`), `width`, `height`, `seed`, `seen` (how much has been seen, 0 to 1), and `x` and `y`, the square the map
//  is centred on. The arrow keys move that square.

import { MAP3D_GLOBAL, Map3DScript } from '@civ-clone/ui-map/MapView3DFactory';
import { PlayerTile, Tile } from '@civ-clone/ui-protocol/types';
import Transport from '@civ-clone/ui-client/Transport';
import World from '@civ-clone/ui-map/components/World';
import generateWorld from './generateWorld';
import pageOptions from './pageOptions';

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

const start = (script: Map3DScript): void => {
  const options = pageOptions(location.search),
    { terrain } = generateWorld(options),
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
      tiles: terrain.flatMap((row, y) =>
        row.map((name, x) => tileAt(x, y, name))
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
      cityOpener: { opens: () => false, open: () => {} },
      coveredBy: [],
      debug: true,
      lockVerticalEdges: true,
      mapCanvas: canvas,
      playerId: 'debug',
      // Nothing on the page talks to a game.
      transport: {} as Transport,
      world,
    }),
    centre = { x: options.x, y: options.y },
    moves: { [key: string]: [number, number] } = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    },
    // The address follows the centre, so a reload or a copied link shows the same place.
    remember = (): void => {
      const query = new URLSearchParams(location.search);

      query.set('x', String(centre.x));
      query.set('y', String(centre.y));
      history.replaceState(null, '', `?${query}`);
    };

  view.centre(world.get(centre.x, centre.y));

  document.addEventListener('keydown', (event) => {
    const move = moves[event.key];

    if (
      move === undefined ||
      (event.target instanceof HTMLElement &&
        event.target.closest('form') !== null)
    ) {
      return;
    }

    event.preventDefault();
    centre.x =
      (((centre.x + move[0]) % options.width) + options.width) % options.width;
    centre.y = Math.min(options.height - 1, Math.max(0, centre.y + move[1]));
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
