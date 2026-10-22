import NotificationWindow from '../components/NotificationWindow';
import Transport from '../Transport';
import { t } from 'i18next';

export interface WorkerFailuresDeps {
  // `window.alert` and `location.reload`, which a test stands in for.
  alert: (message: string) => void;
  reload: () => void;
}

// What went wrong in the worker (#470), which the player would otherwise never hear of: an error or a rejection nothing
//  handled, a game that could not start or an action that threw (`workerError`), and a request it could not answer
//  (`requestFailed`), each said in a window, and a load that failed (`loadFailed`), said, then back to the main menu.
//  The worker's message goes as text: it can hold text from a save file. Returns the disposer for `Renderer`'s
//  `transportDisposers`.
export const WorkerFailures = {
  listen(
    transport: Transport,
    {
      alert = (message: string): void => window.alert(message),
      reload = (): void => window.location.reload(),
    }: Partial<WorkerFailuresDeps> = {}
  ): () => void {
    const show = (message: string): void => {
        const body = document.createElement('div'),
          what = document.createElement('p');

        what.textContent = t('WorkerFailure.body');
        body.append(what);

        if (message) {
          const detail = document.createElement('p');

          detail.textContent = message;
          body.append(detail);
        }

        new NotificationWindow(t('WorkerFailure.title'), body).display();
      },
      disposers = [
        transport.receive('workerError', ({ message }): void => show(message)),
        transport.receive('requestFailed', ({ message }): void =>
          show(message)
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
      ];

    return (): void => disposers.forEach((dispose) => dispose());
  },
};

export default WorkerFailures;
