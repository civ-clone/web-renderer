// What civ.one is made of (#825): the interfaces it offers, and the grids its map draws.
import './interfaces.ts';
import '@civ-clone/ui-map-square';
import Renderer from '@civ-clone/ui-game/bootstrap';
import WorkerTransport from '@civ-clone/ui-worker-transport/WorkerTransport';
import { version } from '../../build.json';

// The build's version on the worker's URL, as on the page's own script and
//  stylesheet (#476): a `frontend.js` and a `backend.js` from different deploys
//  can't work together.
const renderer = new Renderer(
  new WorkerTransport(
    new Worker(`dist/backend.js?v=${encodeURIComponent(version)}`)
  )
);

renderer.init();
