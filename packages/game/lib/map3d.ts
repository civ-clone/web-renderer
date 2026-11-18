// The 3D map, behind `?3d=1` (docs/3d-renderer.md §2.4, §14), and which map a game is drawn on.
//
// The 3D map is a script of its own, `dist/map3d.js`, fetched the first time a game starts or loads in 3D, before the
//  worker is told to start it: the game itself then starts as it always has, all at once, on whichever map is ready.
//  A page that didn't ask for it, or a browser without WebGL2, never fetches it. Nothing here stops a game starting:
//  failing anything, the map is 2D, and the player is told why once.

import { t } from 'i18next';
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

/** Whether the page asked for the 3D map (`?3d=1`). */
export const map3dAsked = (search: string): boolean =>
  parseBooleanParam(new URLSearchParams(search).get('3d'), false);

/** Whether this browser can draw the 3D map: three.js's renderer needs WebGL2. */
export const hasWebGL2 = (): boolean => {
  try {
    return document.createElement('canvas').getContext('webgl2') !== null;
  } catch {
    return false;
  }
};

/** Fetches `dist/map3d.js`, versioned by the build so a cached copy doesn't outlive a deploy, and resolves its factory. */
export const loadMap3DScript = (): Promise<CreateMapView3D> =>
  new Promise((resolve, reject) => {
    const script = document.createElement('script');

    script.src = `dist/map3d.js?v=${encodeURIComponent(build.version)}`;
    script.async = true;
    script.addEventListener('load', () => {
      const loaded = (window as unknown as { [MAP3D_GLOBAL]?: Map3DScript })[
        MAP3D_GLOBAL
      ];

      if (loaded === undefined) {
        reject(new Error('dist/map3d.js put no map on the page'));

        return;
      }

      resolve(loaded.createMapView3D);
    });
    script.addEventListener('error', () =>
      reject(new Error('dist/map3d.js could not be fetched'))
    );

    document.head.append(script);
  });

export type PrepareMap3DOptions = {
  // The page's query string, which asks for it.
  search?: string;
  webgl2?: () => boolean;
  load?: () => Promise<CreateMapView3D>;
};

// The 3D map's factory, once its script has loaded, and whether the player has been told why the map is 2D.
let factory: CreateMapView3D | null = null,
  told = false;

/**
 * Readies the 3D map, if the page asked for it and this browser can draw it: its script is fetched once, and every game
 *  after is drawn on it (`makeMapView`). Otherwise, or if the script can't be fetched, the map is 2D, and `say` tells the
 *  player why, once.
 */
export const prepareMap3D = async (
  say: (text: string) => void,
  {
    search = window.location.search,
    webgl2 = hasWebGL2,
    load = loadMap3DScript,
  }: PrepareMap3DOptions = {}
): Promise<void> => {
  if (factory !== null || !map3dAsked(search)) {
    return;
  }

  const tell = (text: string): void => {
    if (!told) {
      told = true;
      say(text);
    }
  };

  if (!webgl2()) {
    tell(t('Map3D.no-webgl2'));

    return;
  }

  try {
    factory = await load();
  } catch (error) {
    console.error(error);
    tell(t('Map3D.not-loaded'));
  }
};

/** Forgets the 3D map's script and what the player's been told, as a fresh page would: for the tests. */
export const forgetMap3D = (): void => {
  factory = null;
  told = false;
};

/**
 * The map a game is drawn on: the 3D map, once `prepareMap3D` has readied it, or else the 2D map. The 3D map is given
 *  what the 2D map is, with the world made here and the 2D art's sizes read as the 2D map's portal reads them, which
 *  the city screen still draws with.
 */
export const makeMapView = (deps: MapView2DDeps): MapRenderer => {
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

  return factory({
    activateUnit: deps.activateUnit,
    art: {
      nativeTileSize: () => nativeTileSize(tileset()),
      scale: () => scaleOfZoom(zoom()),
      zoom,
    },
    cityOpener: deps.cityOpener,
    coveredBy: deps.coveredBy ?? [],
    lockVerticalEdges: deps.options.get('lockVerticalEdges', false),
    mapCanvas: deps.mapPortal,
    playerId: deps.playerId,
    transport: deps.transport,
    world,
  });
};
