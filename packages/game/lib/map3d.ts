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
import ancientUnits from '@civ-clone/ui-models-0ad';
import {
  MAP3D_RIVALS_WALK_OPTION,
  MAP3D_UNIT_SIZE_OPTION,
  MAP3D_WALKS_OPTION,
  map3dAsked,
  map3dModelsAsked,
  unitSizeFor,
  walkSpeedFor,
} from '@civ-clone/ui-client/lib/map3dOptions';
import {
  CreateMapView3D,
  MAP3D_GLOBAL,
  Map3DScript,
  MapView3DDeps,
} from '@civ-clone/ui-map/MapView3DFactory';
import cityLabels from '@civ-clone/ui-map/components/Map/cityLabels';
import { CityNames } from '@civ-clone/ui-map/components/Map/CityNames';
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
import { cityName } from '@civ-clone/ui-client/components/lib/city';
import { unitStatus } from '@civ-clone/ui-assets/lib/renderUnit';
import {
  getPreloadedImage,
  hasPreloadedImage,
  onPreloadedImagesChanged,
} from '@civ-clone/ui-assets/lib/getPreloadedImage';
import {
  interfaceArt,
  interfaceSpriteName,
} from '@civ-clone/ui-assets/lib/interfaceArt';
import {
  TilesetDescriptor,
  expandName,
} from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';
import MapView2D, { MapView2DDeps } from '../MapView2D';
import mapSquares from './mapSquares';
import { instance as options } from '@civ-clone/ui-platform/GameOptionsRegistry';

/** The option the 3D camera's distance is kept in, as each set's zoom is kept in its own (`zoomOption`). */
export const MAP3D_DISTANCE_OPTION = 'map3dDistance';

// How long the script has to arrive before the game starts in 2D without it.
const LOAD_TIMEOUT = 30000;

// Where the page and its menus both read it.
export { map3dAsked };

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
//  map is 2D, and how; and the set of models the page asked to try out, if it did.
let factory: CreateMapView3D | null = null,
  loading: Promise<CreateMapView3D> | null = null,
  told = false,
  say: (text: string) => void = sayMap3DFellBack,
  modelsAsked: { url: string } | undefined;

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

  modelsAsked = map3dModelsAsked(search);

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
  modelsAsked = undefined;
};

/**
 * The icon for a yield, as the 2D map draws it over a square with `y` (`Yields`): the map's pack's own, where it has one
 *  and it's imported, or the interface's, or nothing where neither has been loaded.
 */
export const yieldIconFrom =
  (tileset: () => TilesetDescriptor) =>
  (name: string): CanvasImageSource | null => {
    const set = tileset(),
      word = set.yields?.names[name];

    if (word !== undefined) {
      const path = expandName(set.yields!.sprite, { yield: word });

      if (hasPreloadedImage(path, set)) {
        return getPreloadedImage(path, set);
      }
    }

    const art = interfaceArt(),
      path = interfaceSpriteName(`city/${name.toLowerCase()}`, art);

    return hasPreloadedImage(path, art) ? getPreloadedImage(path, art) : null;
  };

/**
 * Tells `changed` whenever the theme, light or dark, or the fonts loaded change, as the 2D map's banners are drawn again
 *  then (`MapView2D`), returning what stops it. Nothing where the page has none of these (the tests' DOM).
 */
export const onRestyled = (changed: () => void): (() => void) => {
  const observer =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver(() => changed()),
    scheme = window.matchMedia?.('(prefers-color-scheme: dark)') ?? null,
    fonts = document.fonts ?? null,
    handler = (): void => changed();

  observer?.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'data-ui-theme'],
  });
  // Older Safari's list has only `addListener`: there, they follow the theme only when it's chosen.
  scheme?.addEventListener?.('change', handler);
  fonts?.addEventListener?.('loadingdone', handler);

  return (): void => {
    observer?.disconnect();
    scheme?.removeEventListener?.('change', handler);
    fonts?.removeEventListener?.('loadingdone', handler);
  };
};

/**
 * The interface's banners, for the 3D map to hang below its cities (docs/3d-renderer.md §7.5): each city's painted
 *  alone, on a canvas of its own, by the layer the 2D map draws them with, at the 2D map's scale (`scale`), `density`
 *  of the canvas's pixels to each of the map's. Nothing where that layer paints none (the classic label), and painted
 *  again as the theme or the fonts loaded change, where they follow the theme. None at all for an interface whose layer
 *  paints no banner.
 */
export const cityBannersFor = (
  world: World,
  tileset: () => TilesetDescriptor,
  scale: () => number
): MapView3DDeps['cityBanners'] => {
  const labels = cityLabels.current();

  if (labels.layer.prototype.paintBanner === CityNames.prototype.paintBanner) {
    return undefined;
  }

  // The layer, laid out as the 2D map lays it now, over `canvas`: made afresh each time, so it reads the theme as it is.
  const layer = (canvas = document.createElement('canvas')) =>
    new labels.layer(world, scale(), nativeTileSize(tileset()), canvas);

  return {
    paint: (tile, density) => {
      const canvas = document.createElement('canvas'),
        painted = layer(canvas).paintBanner(tile, density);

      return painted === null ? null : { image: canvas, ...painted };
    },
    key: (tile) => layer().bannerKey(tile),
    giveWayToYields: labels.giveWayToYields,
    restyled: (changed) =>
      labels.followTheme ? onRestyled(changed) : (): void => {},
  };
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
        // None chosen yet (`0`, the default), or nothing that's a distance: the camera's own.
        get: (): number | null => {
          const distance = options.get(MAP3D_DISTANCE_OPTION, 0);

          return typeof distance === 'number' &&
            Number.isFinite(distance) &&
            distance > 0
            ? distance
            : null;
        },
        set: (distance: number): void =>
          options.set(MAP3D_DISTANCE_OPTION, distance),
      },
      cityBanners: cityBannersFor(world, tileset, () => scaleOfZoom(zoom())),
      cityName,
      cityOpener: deps.cityOpener,
      coveredBy: deps.coveredBy ?? [],
      debug,
      lockVerticalEdges: deps.options.get('lockVerticalEdges', false),
      mapCanvas: deps.mapPortal,
      minimapCanvas: deps.minimapCanvas,
      // A set of models to try out, where the page asked for one, or else the one that ships with civ.one: 0 A.D.'s
      //  ancient units.
      models: modelsAsked ?? { url: ancientUnits.manifest },
      playerId: deps.playerId,
      squares: mapSquares,
      transport: deps.transport,
      // An option of its own (docs/3d-renderer.md §6.2), changed in Options as the game goes on.
      unitSize: {
        get: (): number => unitSizeFor(options.get(MAP3D_UNIT_SIZE_OPTION, 1)),
        onChange: (changed: () => void): (() => void) =>
          options.onChange((key): void => {
            if (key === MAP3D_UNIT_SIZE_OPTION) {
              changed();
            }
          }),
      },
      unitStatus,
      // Options of their own (docs/3d-renderer.md §8.2), read at each move.
      walks: {
        speed: () => walkSpeedFor(options.get(MAP3D_WALKS_OPTION, 'normal')),
        rivals: (): boolean =>
          options.get(MAP3D_RIVALS_WALK_OPTION, true) !== false,
      },
      world,
      yieldIcon: yieldIconFrom(tileset),
      artChanged: onPreloadedImagesChanged,
    });
  } catch (error) {
    console.error(error);
    tell(t('Map3D.not-started'));

    return new MapView2D({ ...deps, mapPortal: canvasFor2D(deps.mapPortal) });
  }
};
