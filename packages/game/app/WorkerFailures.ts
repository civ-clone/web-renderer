import NotificationWindow from '@civ-clone/ui-component-window/NotificationWindow';
import Transport from '@civ-clone/ui-client/Transport';
import { t } from 'i18next';

export interface WorkerFailuresDeps {
  // `window.alert` and `location.reload`, which a test stands in for.
  alert: (message: string) => void;
  reload: () => void;
}

// What went wrong in the worker (#470), which the player would otherwise never hear of: an error or a rejection nothing
//  handled, a game that could not start, an action that threw, a request it could not answer, or a worker that has
//  said nothing for a while with a request waiting on it (`workerError`, the last two from `WorkerTransport`), each
//  said in a window (one for each thing said: the same again while its window is open says nothing more, #859), a load
//  that failed (`loadFailed`), said, then back to the main menu, and a save that could not
//  be built (`saveFailed`), said. The worker's message goes as text: it can hold text from a save file. Returns the
//  disposer for `Renderer`'s `transportDisposers`.
export const WorkerFailures = {
  listen(
    transport: Transport,
    {
      alert = (message: string): void => window.alert(message),
      reload = (): void => window.location.reload(),
    }: Partial<WorkerFailuresDeps> = {}
  ): () => void {
    // What is being said now, by what it says: a long turn can go quiet more than once, and a failure can repeat.
    const showing = new Map<string, NotificationWindow>(),
      show = (message: string, notAnswering?: boolean): void => {
        const saying = `${notAnswering ? 'quiet' : 'error'}|${message}`;

        // Said, and still on the page: once is enough (#859).
        if (showing.get(saying)?.element().isConnected) {
          return;
        }

        const body = document.createElement('div'),
          what = document.createElement('p');

        what.textContent = t(
          notAnswering ? 'WorkerFailure.not-answering' : 'WorkerFailure.body'
        );
        body.append(what);

        if (message) {
          const detail = document.createElement('p');

          detail.textContent = message;
          body.append(detail);
        }

        const said = new NotificationWindow(t('WorkerFailure.title'), body);

        showing.set(saying, said);
        said.on('close', () => showing.delete(saying));
        said.display();
      },
      disposers = [
        transport.receive('workerError', ({ message, notAnswering }): void =>
          show(message, notAnswering)
        ),
        // The page put its menu away to load, and the save is gone from where it waited: a reload is the menu again.
        transport.receive('loadFailed', ({ message }): void => {
          alert(
            t('SavedGame.could-not-load', {
              error: message,
              interpolation: { escapeValue: false },
            })
          );

          reload();
        }),
        // A save the worker could not build, said as one the page could not write is (`bootstrap`'s `saveGame`), so
        //  that it isn't missed (#581). The game goes on.
        transport.receive('saveFailed', ({ message }): void =>
          alert(
            t('SavedGame.could-not-write', {
              error: message,
              interpolation: { escapeValue: false },
            })
          )
        ),
      ];

    return (): void => disposers.forEach((dispose) => dispose());
  },
};

export default WorkerFailures;
