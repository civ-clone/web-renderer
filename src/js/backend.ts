import Game from '@civ-clone/ui-worker-client/Game';
import ParentTransport from '@civ-clone/worker-transport/ParentTransport';
import { describeError } from '@civ-clone/ui-worker-client/answer';
import pluginSets from './pluginSets';
import { pluginsFrom } from '@civ-clone/ui-worker-client/Plugins';

// The worker's own entry, civ.one's (#825): the transport over the page's messages, and civ.one's sets of plugins as
//  the rules (#668), which `buildPluginList.js` lists. None is imported until a game needs one, and then only that
//  set's plugins run.
const transport = new ParentTransport(),
  game = new Game(transport, pluginsFrom(pluginSets));

// A rejection nothing handled, which would otherwise only be a line in the worker's console (#470). An uncaught error
//  needs nothing here: the page's `Worker` raises it as an `error` event, which `WorkerTransport` passes on.
addEventListener('unhandledrejection', (event: PromiseRejectionEvent): void =>
  transport.send('workerError', { message: describeError(event.reason) })
);

// Started and listening (#470): until the worker has said something, the page can't tell one that has stopped answering
//  from one still loading, so its silence counts for nothing until now.
transport.send('ready', null);
