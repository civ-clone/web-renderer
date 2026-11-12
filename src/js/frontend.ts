// What civ.one is made of (#825): the art packs it draws with, the interfaces it offers, and the grids its map draws.
//  The interface's art pack first: everything drawn takes its art from it (#97). Then the isometric map's.
import '@civ-clone/ui-tileset-civ1';
import '@civ-clone/ui-tileset-civ2';
import './interfaces.ts';
import '@civ-clone/ui-map-square';
// Isometric is drawable, but offered only once an isometric tileset is installed, and none is yet (#97).
import '@civ-clone/ui-map-isometric';
import Renderer from '@civ-clone/ui-game/bootstrap';
import WorkerTransport from '@civ-clone/worker-transport/WorkerTransport';
import { setBuild } from '@civ-clone/ui-client/lib/build';
import { version } from '../../build.json';

// The build's version on the URLs of its own files, as on the page's own script and stylesheet (#476): a
//  `frontend.js` and a `backend.js` (or `musicWorklet.js`) from different deploys can't work together. The packages
//  are told it, and where the files are, rather than reading the build themselves (#866).
const versioned = (file: string) =>
  `dist/${file}?v=${encodeURIComponent(version)}`;

setBuild({
  version,
  musicWorkletUrl: versioned('musicWorklet.js'),
});

const renderer = new Renderer(
  new WorkerTransport(
    new Worker(versioned('backend.js')),
    // The game data is rebuilt incrementally by the page itself (#333).
    { rawChannels: ['gameData'] }
  )
);

renderer.init();
