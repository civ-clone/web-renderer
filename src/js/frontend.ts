import Renderer from './UI/bootstrap';
import WorkerTransport from './Engine/WorkerTransport';

const renderer = new Renderer(
  new WorkerTransport(new Worker('dist/backend.js'))
);

renderer.init();
