// The 3D map's own script (docs/3d-renderer.md §2.4): `dist/map3d.js`, an entry of its own, fetched the first time a
//  game starts in 3D (`@civ-clone/ui-game/lib/map3d`). It puts its factory on the page; everything with state comes
//  to it through that factory's `deps`.

import {
  MAP3D_GLOBAL,
  Map3DScript,
  MapView3DDeps,
} from '@civ-clone/ui-map/MapView3DFactory';
import MapView3D from './MapView3D';

const script: Map3DScript = {
  createMapView3D: (deps: MapView3DDeps) => new MapView3D(deps),
};

(globalThis as unknown as { [MAP3D_GLOBAL]: Map3DScript })[MAP3D_GLOBAL] =
  script;
