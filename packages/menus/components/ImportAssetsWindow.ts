import {
  ChosenFile,
  PackImport,
  filesNeeded,
  importedFirst,
  isUnsupportedFile,
} from '@civ-clone/ui-assets/lib/packImports';
import Window, { WindowOptions } from '@civ-clone/ui-component-window/Window';
import { allowLeaving } from '@civ-clone/ui-component-window/leaveGuard';
import { assetStore } from '@civ-clone/ui-assets/AssetStore';
import { button } from '@civ-clone/ui-component-button/button';
import { h } from '@civ-clone/ui-widgets/lib/html';
import { s, t as textNode } from '@dom111/element';
import { t } from 'i18next';

// One set's import (#1063), opened from the library: that set's instructions, and only its files taken.

/** The extensions of `pack`'s files, as the file input's `accept` takes them: `.PIC`, say. */
const extensionsOf = (pack: PackImport): string =>
  [
    ...new Set(
      [...pack.requiredFiles, ...pack.optionalFiles].flatMap((file) => {
        const dot = file.lastIndexOf('.');

        return dot === -1 ? [] : [file.slice(dot).toLowerCase()];
      })
    ),
  ].join(',');

export class ImportAssetsWindow extends Window {
  // The set whose files this window imports.
  #pack: PackImport;
  // The browser's own file input can't take the theme (#739): it stays, hidden, and this button opens it.
  #fileInput: HTMLInputElement;
  #chooseButton: HTMLButtonElement;
  #chosen: HTMLSpanElement;
  #progressInformation: HTMLParagraphElement;
  // What the set has to say of its import (#97), such as whether a map set's art is complete.
  #packStatus: HTMLParagraphElement;
  // Read when the files arrive, not copied on change: a copy started out of
  // step with the box as drawn (#341).
  #replaceExistingInput: HTMLInputElement;
  // The browser keeps nothing for this site (#850): no files can be chosen, whatever else happens.
  #blocked = false;

  constructor(pack: PackImport, windowOptions: WindowOptions = {}) {
    const fileInput = s<HTMLInputElement>(
        '<input type="file" multiple class="visually-hidden" tabindex="-1" aria-hidden="true">'
      ),
      chooseButton = h(button(t('ImportAssetsWindow.choose')), {
        click: () => fileInput.click(),
      }),
      chosen = s<HTMLSpanElement>(
        `<span class="chosen" aria-live="polite">${t(
          'ImportAssetsWindow.none-chosen'
        )}</span>`
      ),
      replaceExistingInput = s<HTMLInputElement>(
        '<input type="checkbox" checked>'
      ),
      progressInformation = s<HTMLParagraphElement>(
        '<p class="loading" aria-live="polite" hidden></p>'
      ),
      packStatusElement = s<HTMLParagraphElement>(
        '<p class="pack-status" aria-live="polite" hidden></p>'
      ),
      // Said first, above everything else, when nothing imported could be kept (#850).
      storageBlocked = s<HTMLDivElement>(
        '<div class="storage-blocked" role="alert" hidden></div>'
      );

    // Only the set's own files are offered, by their extensions: the picker can still be told to show any file.
    fileInput.accept = extensionsOf(pack);

    super(
      // The title is markup: the set's name is escaped.
      t('ImportAssetsWindow.title', { name: pack.name }),
      s(
        // What the set reads, its own instructions alone.
        `<div class="import-assets"><p>${pack.instructions()}</p><div class="brave" ${
          // @ts-ignore
          navigator?.brave ? '' : ' hidden'
        }>${t('ImportAssetsWindow.brave')}</div></div>`,
        // Only for a set whose import can leave what's stored as it is: not the music's driver, kept whole.
        s(
          `<p class="replace-existing"${
            pack.replacesAll ? ' hidden' : ''
          }></p>`,
          s(
            '<label></label>',
            replaceExistingInput,
            textNode(t('ImportAssetsWindow.replace-existing'))
          )
        ),
        s(
          '<p class="file-picker"></p>',
          chooseButton,
          chosen,
          h(fileInput, {
            change: (event) => {
              const names = Array.from(
                fileInput.files ?? [],
                ({ name }) => name
              );

              this.#showChosen(names);

              // Nothing chosen (the picker closed after an earlier choice) isn't an attempt to import.
              if (names.length) {
                this.handleFileUpload(event);
              }
            },
          })
        ),
        progressInformation,
        packStatusElement
      ),
      windowOptions
    );

    this.#pack = pack;
    this.#fileInput = fileInput;
    this.#chooseButton = chooseButton;
    this.#chosen = chosen;
    this.#replaceExistingInput = replaceExistingInput;
    this.#progressInformation = progressInformation;
    this.#packStatus = packStatusElement;

    this.addClass('import-set');

    // A browser that blocks this site's data would keep nothing that was imported (#850): said before any files are
    //  chosen, at the top of the window, and the choosing is put out of reach rather than left to fail.
    this.element().querySelector('.import-assets')?.prepend(storageBlocked);

    // A store that can't be read has nothing to say about it.
    void this.#showStatus().catch(() => {});

    assetStore.usable().then((usable): void => {
      if (usable) {
        return;
      }

      this.#blocked = true;

      storageBlocked.textContent = t('ImportAssetsWindow.storage-blocked');
      storageBlocked.removeAttribute('hidden');
      fileInput.setAttribute('disabled', '');
      chooseButton.disabled = true;
      replaceExistingInput.disabled = true;
    });
  }

  /** The set whose files this window imports. */
  get pack(): PackImport {
    return this.#pack;
  }

  /** Whether the window takes `file`: one its set reads, or takes and leaves alone. */
  takes(file: ChosenFile): boolean {
    return this.#pack.accepts(file) || (this.#pack.ignores?.(file) ?? false);
  }

  async handleFileUpload(event: InputEvent) {
    this.#progressInformation.removeAttribute('hidden');
    this.#progressInformation.classList.remove('failed');

    const pack = this.#pack,
      files = Array.from(
        (event.target as HTMLInputElement).files ?? []
      ) as File[],
      filenames: string[] = files.map((file: File) => file.name);

    // Civ1's set can't go ahead without each of the required files it still needs, as the library names them
    //  (`filesNeeded`): every one at first, the ones holding what's missing once some is in, and none once its sprites
    //  are all in, when its optional ones (SP299.PIC) can be added on their own. Another set's files can be added on
    //  their own, whenever (#126, #97): its music, or another grid's map art, some of the files at a time. None waits
    //  on Civ1's since #1063, as civ.one's own art draws the game without it.
    if (importedFirst(pack)) {
      const needed = await filesNeeded(pack).catch(() => pack.requiredFiles);

      if (
        !needed.every((file) =>
          filenames.some(
            (filename) => filename.toUpperCase() === file.toUpperCase()
          )
        )
      ) {
        this.#fail(t('ImportAssetsWindow.missing-files', { files: needed }));

        return;
      }
    }

    // Only the set's own files are read: another's, or one no set reads, is left out.
    const own = files.filter((file) => pack.accepts(file));

    files
      .filter((file) => !this.takes(file))
      .forEach((file) =>
        console.warn(`No definitions found for ${file.name}, skipping.`)
      );

    if (own.length === 0) {
      this.#fail(
        t('ImportAssetsWindow.none-of-its-files', {
          name: pack.name,
          files: [...pack.requiredFiles, ...pack.optionalFiles],
          interpolation: { escapeValue: false },
        })
      );

      return;
    }

    this.#fileInput.setAttribute('disabled', '');
    this.#chooseButton.disabled = true;
    this.#progressInformation.innerText = t(
      'ImportAssetsWindow.progress-building'
    );

    try {
      await this.#import(own);
    } catch (error) {
      // A file the extractor can't read (not a Civilization sheet, or one
      //  cut differently from the originals) used to throw inside the
      //  reader's `load` listener, where nothing caught it: the promise never
      //  settled and the window sat on "Building image assets..." for good.
      //  The store refusing to open or write left it the same way.
      console.error(error);

      this.#fail(
        isUnsupportedFile(error)
          ? t('ImportAssetsWindow.unsupported-file', { file: error.file })
          : t('ImportAssetsWindow.failed', {
              error: error instanceof Error ? error.message : String(error),
            })
      );
    }
  }

  /**
   * Extracts the sprites from `files`, the set's own, stores them, and reloads the page to use them. Rejects with what
   *  went wrong, which `handleFileUpload` shows.
   */
  async #import(files: File[]): Promise<void> {
    const existingKeys = await assetStore.keys(),
      replaceExisting = this.#replaceExistingInput.checked;

    // Only while the files are being extracted: one still being extracted
    //  after another has failed would write its progress over the reason the
    //  import stopped, and needn't be cut up at all.
    let extracting = true;

    const progress = (message: string): void => {
        if (extracting) {
          this.#progressInformation.innerText = message;
        }
      },
      wanted = (): boolean => extracting;

    let assets;

    try {
      // Every file, read and its sprites extracted, side by side.
      ({ assets } = await this.#pack.import(files, {
        existingKeys,
        replaceExisting,
        progress,
        wanted,
      }));
    } finally {
      extracting = false;
    }

    this.#progressInformation.innerText = t(
      'ImportAssetsWindow.progress-writing'
    );

    // ...and all results stored in IDB, in a single transaction, each sprite as its PNG (#730).
    await assetStore.setAll(assets);

    // Civ1's import is all or nothing, so its sprites are all in once it's stored. Another set's may be finished in
    //  parts, which its status says (`#showStatus`).
    if (importedFirst(this.#pack) && !(await assetStore.hasAllAssets())) {
      console.error('Something went wrong...');

      this.#fail(
        t('ImportAssetsWindow.missing-data', {
          files: await assetStore.missingAssets(),
        })
      );

      return;
    }

    this.#progressInformation.innerText = t('ImportAssetsWindow.done');

    // A set with something to say of its import (#97): its art still incomplete is said, and the page left for the
    //  player to reload once they've read it, rather than reloaded from under them.
    if (await this.#showStatus()) {
      allowLeaving();
      this.#chooseAgain();

      return;
    }

    // We need to reprocess everything and this is the lazy way...
    allowLeaving();

    location.reload();
  }

  /**
   * Says what the set has to say of its import (#97): whether its art is complete, say, or the files still to import.
   *  Says nothing for a set with nothing to say. Resolves with whether it is still to be finished.
   */
  async #showStatus(): Promise<boolean> {
    const { lines, incomplete } = (await this.#pack.status?.()) ?? {
      lines: [],
      incomplete: false,
    };

    this.#packStatus.textContent = lines.join(' ');
    this.#packStatus.toggleAttribute('hidden', lines.length === 0);

    return incomplete;
  }

  /** The names of the files chosen, as text beside the button (#739). */
  #showChosen(names: string[]): void {
    this.#chosen.textContent = names.length
      ? t('ImportAssetsWindow.chosen', {
          files: names,
          // Set as text, so a name with `&` or `<` in it shows as it is.
          interpolation: { escapeValue: false },
        })
      : t('ImportAssetsWindow.none-chosen');
  }

  /** Shows `message` as the reason the import stopped, and lets the player choose files again. */
  #fail(message: string): void {
    this.#progressInformation.classList.add('failed');
    this.#progressInformation.innerText = message;

    this.#chooseAgain();
  }

  /** Lets the player choose files again: after a failed import, or one that left the set's art incomplete. */
  #chooseAgain(): void {
    // Chosen before the browser was found to keep nothing: there is no trying again.
    if (!this.#blocked) {
      this.#fileInput.removeAttribute('disabled');
      this.#chooseButton.disabled = false;
    }

    // So choosing the same files again counts as a change.
    this.#fileInput.value = '';
    this.#showChosen([]);
  }
}

export default ImportAssetsWindow;
