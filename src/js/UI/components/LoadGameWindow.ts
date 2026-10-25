import {
  AskSeats,
  chooseSaveFile,
  downloadFile,
  loadSaveFromFile,
} from '../lib/savedGame';
import { BrowserSave, deleteSave, listSaves } from '../lib/browserSaves';
import ConfirmationWindow from './ConfirmationWindow';
import ResumeGameWindow from './ResumeGameWindow';
import Transport from '../Transport';
import Window from './Window';
import { h } from '../lib/html';
import { s } from '@dom111/element';
import { t } from 'i18next';

const cell = (text: string, className: string = ''): HTMLTableCellElement => {
  const element = document.createElement('td');

  element.className = className;
  element.textContent = text;

  return element;
};

const button = (label: string, action: () => void): HTMLButtonElement => {
  const element = document.createElement('button');

  element.textContent = label;

  return h(element, { click: action });
};

/**
 * Load Game, from the main menu or the game menu (#653): every save kept in the browser, newest first, to load,
 * download as a file or delete, and a file the player chooses. Either way the save's seats are shown first, to
 * reassign (#608).
 */
export class LoadGameWindow extends Window {
  #askSeats: AskSeats;
  #body: HTMLTableSectionElement;
  #empty: HTMLParagraphElement;

  constructor(saves: BrowserSave[], askSeats: AskSeats) {
    const table = s<HTMLTableElement>('<table class="saved-games"></table>'),
      body = document.createElement('tbody'),
      empty = s<HTMLParagraphElement>(`<p hidden></p>`),
      footer = document.createElement('footer');

    empty.textContent = t('LoadGame.empty');

    table.append(body);

    super(t('LoadGame.title'), s('<div></div>', table, empty, footer), {
      classes: 'load-game-window',
      modal: true,
    });

    this.#askSeats = askSeats;
    this.#body = body;
    this.#empty = empty;

    body.append(...saves.map((save) => this.#row(save)));

    footer.append(
      button(t('LoadGame.from-file'), (): void => {
        this.close();

        chooseSaveFile(askSeats);
      })
    );
  }

  // Built with `createElement`: a `<tr>` parsed on its own, outside a table, loses its cells.
  #row(save: BrowserSave): HTMLTableRowElement {
    const row = document.createElement('tr'),
      actions = document.createElement('td');

    actions.className = 'actions';
    actions.append(
      button(t('LoadGame.load'), (): void => {
        this.close();

        // The player has already been told by the time this rejects, as for a file.
        loadSaveFromFile(save.data, this.#askSeats).catch((): void => {});
      }),
      button(t('LoadGame.download'), (): void => {
        downloadFile(save.name, save.data).catch((error: Error): void =>
          window.alert(t('SavedGame.could-not-write', { error: error.message }))
        );
      }),
      button(t('LoadGame.delete'), (): void => {
        new ConfirmationWindow(
          t('LoadGame.delete'),
          t('LoadGame.delete-confirm', { name: save.name }),
          (): void => {
            deleteSave(save.savedAt)
              .then((): void => {
                row.remove();

                this.#empty.hidden = this.#body.rows.length > 0;
              })
              .catch((error: Error): void =>
                window.alert(
                  t('LoadGame.could-not-delete', { error: error.message })
                )
              );
          },
          // Over this window, which is modal itself: a window that isn't would open behind it.
          { modal: true }
        );
      })
    );

    row.append(
      cell(save.name),
      cell(t(`LoadGame.kind.${save.kind}`)),
      cell(
        new Date(save.savedAt).toLocaleString(undefined, {
          dateStyle: 'short',
          timeStyle: 'short',
        })
      ),
      actions
    );

    return row;
  }
}

/** Load Game: the saves kept in the browser, or with none, straight to a file. */
export const chooseSave = async (transport: Transport): Promise<void> => {
  const askSeats: AskSeats = (save) => ResumeGameWindow.ask(transport, save),
    saves = await listSaves();

  if (saves.length === 0) {
    chooseSaveFile(askSeats);

    return;
  }

  new LoadGameWindow(saves, askSeats);
};

export default LoadGameWindow;
