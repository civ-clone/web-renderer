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

// An error's message, for saying: anything thrown, `Error` or not.
const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const cell = (text: string, className: string = ''): HTMLTableCellElement => {
  const element = document.createElement('td');

  element.className = className;
  element.textContent = text;

  return element;
};

// `name`, when the label alone doesn't say which save it is for: a row's buttons read "Load", "Load", "Load" otherwise.
const button = (
  label: string,
  action: () => void,
  name: string | null = null
): HTMLButtonElement => {
  const element = document.createElement('button');

  element.textContent = label;

  if (name !== null) {
    element.setAttribute('aria-label', name);
  }

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
  #footer: HTMLElement;

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
    this.#footer = footer;

    body.append(...saves.map((save) => this.#row(save)));

    footer.append(
      button(t('LoadGame.from-file'), (): void => {
        this.close();

        chooseSaveFile(askSeats);
      })
    );

    // Up and down move between saves, keeping to the same action, as the arrow keys move through a list elsewhere.
    h(table, {
      keydown: (event: KeyboardEvent): void => {
        const step =
            event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0,
          target = event.target as HTMLElement,
          row = target.closest('tr');

        if (
          step === 0 ||
          row === null ||
          !(target instanceof HTMLButtonElement)
        ) {
          return;
        }

        const rows = Array.from(this.#body.rows),
          column = Array.from(row.querySelectorAll('button')).indexOf(target),
          next = rows[rows.indexOf(row) + step];

        if (next) {
          event.preventDefault();

          next.querySelectorAll('button')[column]?.focus();
        }
      },
    });

    // The newest save's Load, so Enter loads it.
    this.#focusRow(0);
  }

  // The `index`th save's button in `column`, or the last save's, or loading from a file when there are none left.
  #focusRow(index: number, column: number = 0): void {
    const rows = this.#body.rows,
      row = rows[Math.min(index, rows.length - 1)];

    (
      row?.querySelectorAll('button')[column] ??
      this.#footer.querySelector('button')
    )?.focus();
  }

  // Built with `createElement`: a `<tr>` parsed on its own, outside a table, loses its cells.
  #row(save: BrowserSave): HTMLTableRowElement {
    const row = document.createElement('tr'),
      actions = document.createElement('td');

    actions.className = 'actions';
    actions.append(
      button(
        t('LoadGame.load'),
        (): void => {
          this.close();

          // The player has already been told by the time this rejects, as for a file.
          loadSaveFromFile(save.data, this.#askSeats).catch((): void => {});
        },
        t('LoadGame.load-save', { name: save.name })
      ),
      button(
        t('LoadGame.download'),
        (): void => {
          downloadFile(save.name, save.data).catch((error: unknown): void =>
            window.alert(
              t('SavedGame.could-not-write', { error: describe(error) })
            )
          );
        },
        t('LoadGame.download-save', { name: save.name })
      ),
      button(
        t('LoadGame.delete'),
        (): void => {
          new ConfirmationWindow(
            t('LoadGame.delete'),
            t('LoadGame.delete-confirm', { name: save.name }),
            (): void => {
              deleteSave(save.savedAt)
                .then((): void => {
                  const index = row.sectionRowIndex;

                  row.remove();

                  this.#empty.hidden = this.#body.rows.length > 0;

                  // Focus would otherwise fall back to the window, with the button it was on gone.
                  this.#focusRow(index, 2);
                })
                .catch((error: unknown): void =>
                  window.alert(
                    t('LoadGame.could-not-delete', { error: describe(error) })
                  )
                );
            },
            // Over this window, which is modal itself: a window that isn't would open behind it.
            { modal: true }
          );
        },
        t('LoadGame.delete-save', { name: save.name })
      )
    );

    row.append(
      cell(save.name),
      cell(t(`LoadGame.kind.${save.kind}`)),
      cell(
        new Date(save.savedAt).toLocaleString(undefined, {
          dateStyle: 'medium',
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
  // Once: a second click while the saves are read, or with the window open, would open a second over it.
  if (choosing || document.querySelector('.load-game-window[open]')) {
    return;
  }

  choosing = true;

  try {
    await openSaves(transport);
  } finally {
    choosing = false;
  }
};

let choosing = false;

const openSaves = async (transport: Transport): Promise<void> => {
  const askSeats: AskSeats = (save) => ResumeGameWindow.ask(transport, save),
    saves = await listSaves();

  if (saves.length === 0) {
    chooseSaveFile(askSeats);

    return;
  }

  new LoadGameWindow(saves, askSeats);
};

export default LoadGameWindow;
