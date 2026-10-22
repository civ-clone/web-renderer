import Game from './Engine/Game';
import ParentTransport from './Engine/ParentTransport';
import { describeError } from './Engine/answer';

const transport = new ParentTransport(),
  game = new Game(transport);

// A rejection nothing handled, which would otherwise only be a line in the worker's console (#470). An uncaught error
//  needs nothing here: the page's `Worker` raises it as an `error` event, which `WorkerTransport` passes on.
addEventListener('unhandledrejection', (event: PromiseRejectionEvent): void =>
  transport.send('workerError', { message: describeError(event.reason) })
);
