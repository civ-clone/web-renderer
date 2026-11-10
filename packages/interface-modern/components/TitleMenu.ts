import { BrowserSave, listSaves } from '@civ-clone/ui-client/lib/browserSaves';
import { Element, s } from '@dom111/element';
import ReleaseWindow, {
  fetchReleases,
} from '@civ-clone/ui-windows/components/ReleaseWindow';
import { askEarth, askNewGame } from '@civ-clone/ui-windows/components/newGame';
import GameOptions from '@civ-clone/ui-windows/components/GameOptions';
import GameSetupForm from './GameSetupForm';
import HallOfFameWindow, {
  yearLabel,
} from '@civ-clone/ui-reports/components/HallOfFameWindow';
import ImportAssetsWindow from '@civ-clone/ui-windows/components/ImportAssetsWindow';
import ResumeGameWindow from '@civ-clone/ui-windows/components/ResumeGameWindow';
import Transport from '@civ-clone/ui-client/Transport';
import { assetStore } from '@civ-clone/ui-assets/AssetStore';
import { chooseSave } from '@civ-clone/ui-windows/components/LoadGameWindow';
import { h } from '@civ-clone/ui-widgets/lib/html';
import { loadSaveFromFile } from '@civ-clone/ui-windows/lib/savedGame';
import { mappedKeyFromEvent } from '@civ-clone/ui-client/lib/mappedKey';
import { instance as localeProvider } from '@civ-clone/ui-client/LocaleProvider';
import build from '@civ-clone/ui-client/lib/build';
import { t } from 'i18next';
import { unlessRequestFailed } from '@civ-clone/ui-client/lib/unlessRequestFailed';

// The main menu under the new interface (#749, #735): a list down the left in the display face, against an accent
//  rule, each item with its key after it. Continue leads when the browser holds a save; Import assets is there only
//  until the tileset's sprites are. `MainMenu` is the classic one.

export interface TitleMenuItem {
  // Which item it is, as `data-item`: `continue`, `new-game` and the rest.
  name: string;
  label: string;
  // A muted line under the label: when Continue's save was kept.
  detail?: string | null;
  // The key that does the same, by `KeyboardEvent.key`, as one letter.
  hotkey: string;
  action: () => void;
}

// Continue's label: the civilization and year of a save made since #749 says them, or else its name.
export const continueLabel = (save: BrowserSave): string =>
  save.details === undefined
    ? t('TitleMenu.continue-named', { name: save.name })
    : t('TitleMenu.continue-game', {
        civilization: t('Generic.civilization-name.plural', {
          civilization: save.details.civilization,
          player: { civilization: { _: save.details.civilization } },
        }),
        year: yearLabel(save.details.year),
      });

// Continue's second line: what kept the save, and how long ago.
export const continueDetail = (save: BrowserSave): string =>
  t(`TitleMenu.kept.${save.kind}`, {
    when: localeProvider.timeSince(new Date(save.savedAt)),
  });

/** The newest save the browser holds, the autosave or the player's own, or `null` with none. */
export const newestSave = (saves: BrowserSave[]): BrowserSave | null =>
  saves.reduce<BrowserSave | null>(
    (newest, save) =>
      newest === null || save.savedAt > newest.savedAt ? save : newest,
    null
  );

export class TitleMenu extends Element {
  #keydown = (event: KeyboardEvent): void => this.#onKeydown(event);
  #items: TitleMenuItem[] = [];
  // Continue's save being read, so a second press doesn't open its seats twice.
  #continuing = false;
  // Gone, maybe before `build` has read the saves: a save loading as the page opens removes the menu at once.
  #removed = false;
  #transport: Transport;

  constructor(element: HTMLElement, transport: Transport) {
    super(element);

    this.#transport = transport;

    this.addClass('ui-title-menu');

    void this.build();

    this.addClass('active');
  }

  async build(): Promise<void> {
    const [hasAssets, saves] = await Promise.all([
        assetStore.hasAllAssets(),
        listSaves().catch((): BrowserSave[] => []),
      ]),
      save = hasAssets ? newestSave(saves) : null,
      finished = (): void => this.remove();

    // Nothing to build, and above all no keys to listen for, in the game that's loading.
    if (this.#removed) {
      return;
    }

    this.#items = [
      ...(save === null
        ? []
        : [
            {
              name: 'continue',
              label: continueLabel(save),
              detail: continueDetail(save),
              hotkey: t('TitleMenu.key.continue'),
              // As Load game would load it: its seats first, to reassign (#608). The player has been told by the time
              //  this rejects.
              action: (): void => {
                if (this.#continuing) {
                  return;
                }

                this.#continuing = true;

                // The saves as they are now: Load game may have deleted this one, or kept a newer. Then the menu says
                //  so, rather than loading what it showed.
                void listSaves()
                  .catch((): BrowserSave[] => [])
                  .then(async (saves): Promise<void> => {
                    if (newestSave(saves)?.savedAt !== save.savedAt) {
                      await this.build();

                      return;
                    }

                    await loadSaveFromFile(save.data, (save) =>
                      ResumeGameWindow.ask(this.#transport, save)
                    );
                  })
                  .catch((): void => {})
                  .finally((): void => {
                    this.#continuing = false;
                  });
              },
            },
          ]),
      ...(hasAssets
        ? [
            {
              name: 'new-game',
              label: t('TitleMenu.new-game'),
              hotkey: t('TitleMenu.key.new-game'),
              // The sizes, or Customise… for the game setup (#605), whose Advanced section has the rest.
              action: (): void =>
                askNewGame(this.#transport, finished, () =>
                  GameSetupForm.ask(this.#transport, finished).catch(
                    unlessRequestFailed
                  )
                ),
            },
            {
              name: 'earth',
              label: t('TitleMenu.earth'),
              hotkey: t('TitleMenu.key.earth'),
              action: (): void => askEarth(this.#transport, finished),
            },
            {
              name: 'load-game',
              label: t('TitleMenu.load-game'),
              hotkey: t('TitleMenu.key.load-game'),
              action: (): void => void chooseSave(this.#transport),
            },
          ]
        : []),
      {
        name: 'hall-of-fame',
        label: t('TitleMenu.hall-of-fame'),
        hotkey: t('TitleMenu.key.hall-of-fame'),
        action: (): void => void new HallOfFameWindow(),
      },
      {
        name: 'options',
        label: t('TitleMenu.options'),
        hotkey: t('TitleMenu.key.options'),
        // No game yet: the map's options are kept for the next (#749).
        action: (): void => void new GameOptions(null),
      },
      // Until there's a tileset that comes with the game (#152), the only way to the sprites.
      ...(hasAssets
        ? []
        : [
            {
              name: 'import-assets',
              label: t('TitleMenu.import-assets'),
              hotkey: t('TitleMenu.key.import-assets'),
              action: (): void => void new ImportAssetsWindow(),
            },
          ]),
    ];

    // Built again when Continue finds the saves changed.
    this.element().querySelector('.ui-title-menu-panel')?.remove();

    this.append(
      s(
        '<div class="ui-title-menu-panel"></div>',
        s(
          `<ul class="ui-title-menu-items" aria-label="${t(
            'TitleMenu.label'
          )}"></ul>`,
          ...this.#items.map((item) => s('<li></li>', this.#button(item)))
        ),
        s(
          '<p class="ui-title-menu-footer"></p>',
          s(
            `<span>${t('TitleMenu.version', { version: build.version })}</span>`
          ),
          h(
            s(
              `<button type="button" class="btn-bare ui-title-menu-link">${t(
                'TitleMenu.release-notes'
              )}</button>`
            ),
            {
              click: (): void =>
                void new ReleaseWindow(() => fetchReleases(build.version)),
            }
          )
        )
      )
    );

    document.addEventListener('keydown', this.#keydown);

    this.#buttons()[0]?.focus();
  }

  #button({ name, label, detail = null, hotkey, action }: TitleMenuItem) {
    const element = s<HTMLButtonElement>(
      `<button type="button" class="btn-bare ui-title-menu-item" data-item="${name}"></button>`,
      s('<span class="label"></span>'),
      ...(detail === null ? [] : [s('<span class="detail"></span>')]),
      s('<span class="key" aria-hidden="true"></span>')
    );

    // As text: a save's name is the player's.
    element.querySelector('.label')!.textContent = label;
    element.querySelector('.key')!.textContent = hotkey;

    if (detail !== null) {
      element.querySelector('.detail')!.textContent = detail;
    }

    element.setAttribute('aria-keyshortcuts', hotkey);

    return h(element, {
      click: action,
    });
  }

  #buttons(): HTMLButtonElement[] {
    return Array.from(
      this.element().querySelectorAll<HTMLButtonElement>(
        'button.ui-title-menu-item:not([disabled])'
      )
    );
  }

  // An item's key, and the arrow keys between the items. Not while a window is open over the menu, or a field has the
  //  key, nor with a modifier, which is the browser's.
  #onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;

    if (
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      document.querySelector('dialog[open]') !== null ||
      target?.closest('input, select, textarea, [contenteditable]')
    ) {
      return;
    }

    const buttons = this.#buttons(),
      index = buttons.indexOf(document.activeElement as HTMLButtonElement),
      // The numpad's 8 and 2 too, as the classic menu takes them.
      arrow = mappedKeyFromEvent(event),
      step = arrow === 'ArrowDown' ? 1 : arrow === 'ArrowUp' ? -1 : 0;

    if (step !== 0) {
      buttons[index === -1 ? 0 : index + step]?.focus();
      event.preventDefault();

      return;
    }

    const item = this.#items.find(
      ({ hotkey }) => hotkey.toLowerCase() === event.key.toLowerCase()
    );

    if (item === undefined || buttons.length === 0) {
      return;
    }

    event.preventDefault();
    item.action();
  }

  remove(): void {
    this.#removed = true;

    document.removeEventListener('keydown', this.#keydown);

    this.queryAll('button').forEach((button) =>
      button.setAttribute('disabled', '')
    );

    this.removeClass('active');

    setTimeout((): void => super.remove(), 2000);
  }
}

export default TitleMenu;
