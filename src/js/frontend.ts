import Renderer from './UI/Renderer';
import WorkerTransport from './Engine/WorkerTransport';

const renderer = new Renderer(
  new WorkerTransport(new Worker('dist/backend.js'))
);

renderer.init();
