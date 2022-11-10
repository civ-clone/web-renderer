import Renderer from './Renderer';
import WorkerTransport from '../../client/WorkerTransport';

const renderer = new Renderer(
  new WorkerTransport(new Worker('view/js/backend.js'))
);

renderer.init();
