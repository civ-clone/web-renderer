// The 3D map, behind `?3d=1` (docs/3d-renderer.md §2.4, §14), and which map a game is drawn on.
//
// The 3D map is a script of its own, `dist/map3d.js`, fetched the first time a game starts or loads in 3D, before the
//  worker is told to start it: the game itself then starts as it always has, all at once, on whichever map is ready.
//  A page that didn't ask for it, or a browser without WebGL2, never fetches it. Nothing here stops a game starting:
//  failing anything, the map is 2D, and the player is told why once, in a window, as the map's art falling back is
//  (`sayMapArtFellBack`).

import { t } from 'i18next';
import NotificationWindow from '@civ-clone/ui-component-window/NotificationWindow';
import build from '@civ-clone/ui-client/lib/build';
import parseBooleanParam from '@civ-clone/ui-client/lib/parseBooleanParam';
import {
  CreateMapView3D,
  MAP3D_GLOBAL,
  Map3DScript,
} from '@civ-clone/ui-map/MapView3DFactory';
import MapRenderer from '@civ-clone/ui-map/MapRenderer';
import World from '@civ-clone/ui-map/components/World';
import { scaleOfZoom } from '@civ-clone/ui-map/components/Portal';
import {
  defaultZoom,
  mapTileset,
  nativeTileSize,
  setMapGrid,
  zoomFor,
  zoomOption,
} from '@civ-clone/ui-assets/lib/tilesets';
import MapView2D, { MapView2DDeps } from '../MapView2D';
import { instance as options } from '@civ-clone/ui-platform/GameOptionsRegistry';

/** The option the 3D camera's distance is kept in, as each set's zoom is kept in its own (`zoomOption`). */
export const MAP3D_DISTANCE_OPTION = 'map3dDistance';

// How long the script has to arrive before the game starts in 2D without it.
const LOAD_TIMEOUT = 30000;

/** Whether the page asked for the 3D map (`?3d=1`). */
export const map3dAsked = (search: string): boolean =>
  parseBooleanParam(new URLSearchParams(search).get('3d'), false);

/** Whether this browser can draw the 3D map: three.js's renderer needs WebGL2. The context asked for is let go. */
export const hasWebGL2 = (): boolean => {
  try {
    const context = document.createElement('canvas').getContext('webgl2');

    context?.getExtension('WEBGL_lose_context')?.loseContext();

    return context !== null;
  } catch {
    return false;
  }
};

/**
 * Fetches `dist/map3d.js`, versioned by the build so a cached copy doesn't outlive a deploy, and resolves its factory.
 *  Rejects if it can't be fetched, puts nothing on the page, or takes longer than `timeout` ms.
 */
export const loadMap3DScript = (
  timeout: number = LOAD_TIMEOUT
): Promise<CreateMapView3D> =>
  new Promise((resolve, reject) => {
    // One that arrived after an earlier start had stopped waiting for it: not fetched again.
    const arrived = (window as unknown as { [MAP3D_GLOBAL]?: Map3DScript })[
      MAP3D_GLOBAL
    ];

    if (arrived !== undefined) {
      resolve(arrived.createMapView3D);

      return;
    }

    const script = document.createElement('script'),
      timer = window.setTimeout(() => {
        // Left to arrive, if it does, for the next start to find.
        reject(new Error('dist/map3d.js took too long to fetch'));
      }, timeout);

    script.src = `dist/map3d.js?v=${encodeURIComponent(build.version)}`;
    script.async = true;
    script.addEventListener('load', () => {
      window.clearTimeout(timer);

      const loaded = (window as unknown as { [MAP3D_GLOBAL]?: Map3DScript })[
        MAP3D_GLOBAL
      ];

      if (loaded === undefined) {
        reject(new Error('dist/map3d.js put no map on the page'));

        return;
      }

      resolve(loaded.createMapView3D);
    });
    script.addEventListener('error', () => {
      window.clearTimeout(timer);
      reject(new Error('dist/map3d.js could not be fetched'));
    });

    document.head.append(script);
  });

/** Tells the player why the map is 2D, in a window that stays until it's closed. */
export const sayMap3DFellBack = (text: string): void => {
  const body = document.createElement('p');

  body.textContent = text;

  new NotificationWindow(t('Map3D.fell-back-title'), body).display();
};

export type PrepareMap3DOptions = {
  // The page's query string, which asks for it.
  search?: string;
  webgl2?: () => boolean;
  load?: () => Promise<CreateMapView3D>;
  // How the player is told why the map is 2D.
  say?: (text: string) => void;
};

// The 3D map's factory, once its script has loaded; the script being fetched; whether the player has been told why the
//  map is 2D, and how.
let factory: CreateMapView3D | null = null,
  loading: Promise<CreateMapView3D> | null = null,
  told = false,
  say: (text: string) => void = sayMap3DFellBack;

const tell = (text: string): void => {
  if (!told) {
    told = true;
    say(text);
  }
};

/**
 * Readies the 3D map, if the page asked for it and this browser can draw it: its script is fetched once, however many
 *  starts ask for it, and every game after is drawn on it (`makeMapView`). Otherwise, or if the script can't be
 *  fetched, the map is 2D, and the player is told why, once.
 */
export const prepareMap3D = async ({
  search = window.location.search,
  webgl2 = hasWebGL2,
  load = loadMap3DScript,
  say: sayWith = sayMap3DFellBack,
}: PrepareMap3DOptions = {}): Promise<void> => {
  if (factory !== null || !map3dAsked(search)) {
    return;
  }

  say = sayWith;

  if (!webgl2()) {
    tell(t('Map3D.no-webgl2'));

    return;
  }

  try {
    loading ??= load();
    factory = await loading;
  } catch (error) {
    console.error(error);
    // Tried again by the next start, if there is one.
    loading = null;
    tell(t('Map3D.not-loaded'));
  }
};

/** Forgets the 3D map's script and what the player's been told, as a fresh page would: for the tests. */
export const forgetMap3D = (): void => {
  factory = null;
  loading = null;
  told = false;
  say = sayMap3DFellBack;
};

// A canvas that a WebGL context has been taken on can't give a 2D one: one in its place, the same size, for the 2D map.
const canvasFor2D = (canvas: HTMLCanvasElement): HTMLCanvasElement => {
  if (canvas.getContext('2d') !== null) {
    return canvas;
  }

  const fresh = canvas.cloneNode(false) as HTMLCanvasElement;

  fresh.width = canvas.width;
  fresh.height = canvas.height;
  canvas.replaceWith(fresh);

  return fresh;
};

/**
 * The map a game is drawn on: the 3D map, once `prepareMap3D` has readied it, or else the 2D map. The 3D map is given
 *  what the 2D map is, with the world made here and the 2D art's sizes read as the 2D map's portal reads them, which
 *  the city screen still draws with. A 3D map that can't be made here after all (WebGL2 refused on the map's own
 *  canvas) leaves the game on the 2D map, and the player told why.
 */
export const makeMapView = (
  deps: MapView2DDeps,
  { debug = false }: { debug?: boolean } = {}
): MapRenderer => {
  if (factory === null) {
    return new MapView2D(deps);
  }

  const world = new World(deps.world),
    tileset = () => mapTileset(world.topologyId()),
    zoom = (): number => {
      const set = tileset();

      return zoomFor(set, deps.options.get(zoomOption(set), defaultZoom(set)));
    };

  // The city screen's map is drawn with the art for the world's grid, as under the 2D map.
  setMapGrid(world.topologyId());

  try {
    return factory({
      activateUnit: deps.activateUnit,
      art: {
        id: () => tileset().id,
        nativeTileSize: () => nativeTileSize(tileset()),
        scale: () => scaleOfZoom(zoom()),
        zoom,
      },
      // An option of its own (docs/3d-renderer.md §11), as each set's zoom is.
      cameraDistance: {
        get: (): number | null => {
          const distance = options.get(MAP3D_DISTANCE_OPTION, null);

          return typeof distance === 'number' && Number.isFinite(distance)
            ? distance
            : null;
        },
        set: (distance: number): void =>
          options.set(MAP3D_DISTANCE_OPTION, distance),
      },
      cityOpener: deps.cityOpener,
      coveredBy: deps.coveredBy ?? [],
      debug,
      lockVerticalEdges: deps.options.get('lockVerticalEdges', false),
      mapCanvas: deps.mapPortal,
      playerId: deps.playerId,
      transport: deps.transport,
      world,
    });
  } catch (error) {
    console.error(error);
    tell(t('Map3D.not-started'));

    return new MapView2D({ ...deps, mapPortal: canvasFor2D(deps.mapPortal) });
  }
};
