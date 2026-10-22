import Renderer from './UI/bootstrap';
import WorkerTransport from './Engine/WorkerTransport';
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
