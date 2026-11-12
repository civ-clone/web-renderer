import {
  Asset,
  SOUND_DRIVER,
  assetStore,
} from '@civ-clone/ui-assets/AssetStore';
import {
  ChosenFile,
  PackImport,
  PackImportResult,
  isNeeded,
  isUnsupportedFile,
  packImportFor,
  packImports,
  unsupportedFile,
} from '@civ-clone/ui-assets/lib/packImports';
import CvlImage from '@civ-clone/ui-audio/cvl/Image';
import Window, { WindowOptions } from '@civ-clone/ui-component-window/Window';
import { allowLeaving } from '@civ-clone/ui-component-window/leaveGuard';
import { button } from '@civ-clone/ui-component-button/button';
import { h } from '@civ-clone/ui-widgets/lib/html';
import { s, t as textNode } from '@dom111/element';
import { t } from 'i18next';
// Civilization II's import, registered as it is loaded, until it is a package of its own as Civ1's is (#97).
import '../lib/civ2Import';

// Civilization's AdLib sound driver, kept as it is for the music (#126) rather than cut up.
const soundFile = 'ASOUND.CVL',
  isSoundFile = (file: ChosenFile): boolean =>
    file.name.toUpperCase() === soundFile,
  // The files a first import can't go ahead without: the ones the packs the import needs list (`isNeeded`).
  requiredFiles = (): string[] =>
    packImports().flatMap(({ requiredFiles }) => requiredFiles);

/**
 * Whether the window takes `file`: the music's driver, or a file a registered pack reads (`packImportFor`) or takes and
 *  leaves alone.
 */
export const takesFile = (file: ChosenFile): boolean =>
  isSoundFile(file) ||
  packImports().some(
    (pack) => pack.accepts(file) || (pack.ignores?.(file) ?? false)
  );

export class ImportAssetsWindow extends Window {
  // The browser's own file input can't take the theme (#739): it stays, hidden, and this button opens it.
  #fileInput: HTMLInputElement;
  #chooseButton: HTMLButtonElement;
  #chosen: HTMLSpanElement;
  #progressInformation: HTMLParagraphElement;
  // What the packs have to say of their imports (#97), such as whether Civilization II's map art is complete.
  #packStatus: HTMLParagraphElement;
  // Read when the files arrive, not copied on change: a copy started out of
  // step with the box as drawn (#341).
  #replaceExistingInput: HTMLInputElement;
  // The browser keeps nothing for this site (#850): no files can be chosen, whatever else happens.
  #blocked = false;

  constructor(windowOptions: WindowOptions = {}) {
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
        '<p class="loading" hidden></p>'
      ),
      packStatusElement = s<HTMLParagraphElement>(
        '<p class="pack-status" aria-live="polite" hidden></p>'
      ),
      // Said first, above everything else, when nothing imported could be kept (#850).
      storageBlocked = s<HTMLDivElement>(
        '<div class="storage-blocked" role="alert" hidden></div>'
      );

    super(
      t('ImportAssetsWindow.title'),
      s(
        // What each pack reads, the music's driver after the files the import needs.
        `<div class="import-assets"><p>${[
          ...packImports()
            .filter(isNeeded)
            .map((pack) => pack.instructions()),
          t('ImportAssetsWindow.optional-sound', {
            file: soundFile,
          }),
          ...packImports()
            .filter((pack) => !isNeeded(pack))
            .map((pack) => pack.instructions()),
        ].join(' ')}</p><div class="brave" ${
          // @ts-ignore
          navigator?.brave ? '' : ' hidden'
        }>${t('ImportAssetsWindow.brave')}</div></div>`,
        s(
          '<p></p>',
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

    this.#fileInput = fileInput;
    this.#chooseButton = chooseButton;
    this.#chosen = chosen;
    this.#replaceExistingInput = replaceExistingInput;
    this.#progressInformation = progressInformation;
    this.#packStatus = packStatusElement;

    // A browser that blocks this site's data would keep nothing that was imported (#850): said before any files are
    //  chosen, at the top of the window, and the choosing is put out of reach rather than left to fail.
    this.element().querySelector('.import-assets')?.prepend(storageBlocked);

    // A store that can't be read has nothing to say about it.
    void this.#showStatus(packImports(), {}).catch(() => {});

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

  async handleFileUpload(event: InputEvent) {
    this.#progressInformation.removeAttribute('hidden');
    this.#progressInformation.classList.remove('failed');

    const files = Array.from(
        (event.target as HTMLInputElement).files ?? []
      ) as File[],
      filenames: string[] = files.map((file: File) => file.name),
      expectedFilenames = requiredFiles(),
      expectedMatches = expectedFilenames.map((key) => new RegExp(key, 'i')),
      // ASOUND.CVL alone is enough once the sprites are in (#126): the music can be added later. So are the files of a
      //  pack the import doesn't need, such as Civilization II's sheets (#97), for its map.
      adding =
        files.some(
          (file) =>
            isSoundFile(file) ||
            packImports().some((pack) => !isNeeded(pack) && pack.accepts(file))
        ) && (await assetStore.hasAllAssets().catch((): boolean => false));

    if (
      !adding &&
      !expectedMatches.every((expectedMatch) =>
        filenames.some((filename) => filename.match(expectedMatch))
      )
    ) {
      this.#fail(
        t('ImportAssetsWindow.missing-files', { files: expectedFilenames })
      );

      return;
    }

    this.#fileInput.setAttribute('disabled', '');
    this.#chooseButton.disabled = true;
    this.#progressInformation.innerText = t(
      'ImportAssetsWindow.progress-building'
    );

    try {
      await this.#import(files);
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
   * Extracts the sprites from `files`, stores them, and reloads the page to
   * use them. Rejects with what went wrong, which `handleFileUpload` shows.
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

    // ASOUND.CVL, checked before anything is cut up: kept as the file it is.
    const sound = await this.#sound(files.find(isSoundFile));

    // Each pack's files, read by its own import (#97). A file no pack reads is left out; one a pack takes and leaves
    //  alone (Civilization II's RULES.TXT, whose units keep their default names for now) isn't read at all.
    const byPack = new Map<PackImport, File[]>();

    files
      .filter((file) => !isSoundFile(file))
      .forEach((file) => {
        const pack = packImportFor(file);

        if (pack !== undefined) {
          byPack.set(pack, [...(byPack.get(pack) ?? []), file]);

          return;
        }

        if (!takesFile(file)) {
          console.warn(`No definitions found for ${file.name}, skipping.`);
        }
      });

    // With the files of a pack the import needs (Civilization's own), another's that can't be read is left out,
    //  rather than stopping theirs.
    const chosen = packImports().filter((pack) => byPack.has(pack)),
      skipUnreadable = chosen.some(isNeeded);

    let results: PackImportResult[];

    try {
      // Every file, read and its sprites extracted, each pack's by its own import, side by side.
      results = await Promise.all(
        chosen.map((pack) =>
          pack.import(byPack.get(pack)!, {
            existingKeys,
            replaceExisting,
            progress,
            wanted,
            skipUnreadable,
          })
        )
      );
    } finally {
      extracting = false;
    }

    this.#progressInformation.innerText = t(
      'ImportAssetsWindow.progress-writing'
    );

    // ...and all results stored in IDB, in a single transaction, each sprite as its PNG (#730).
    await assetStore.setAll([
      ...results.flatMap(({ assets }) => assets),
      ...sound,
    ]);

    if (!(await assetStore.hasAllAssets())) {
      console.error('Something went wrong...');

      this.#fail(
        t('ImportAssetsWindow.missing-data', {
          files: await assetStore.missingAssets(),
        })
      );

      return;
    }

    this.#progressInformation.innerText = t('ImportAssetsWindow.done');

    // A pack with something to say whose files were chosen (#97), such as Civilization II's: a sheet left out, or its
    //  art still incomplete, is said, and the page left for the player to reload once they've read it, rather than
    //  reloaded from under them.
    const telling = chosen.filter((pack) => pack.status !== undefined);

    if (telling.length > 0) {
      const incomplete = await this.#showStatus(
        telling,
        Object.fromEntries(
          chosen.map((pack, index) => [pack.id, results[index]!.skipped])
        )
      );

      if (incomplete) {
        allowLeaving();
        this.#chooseAgain();

        return;
      }
    }

    // We need to reprocess everything and this is the lazy way...
    allowLeaving();

    location.reload();
  }

  /**
   * Says what each of `packs` has to say of its import (#97), naming the files of its that were `skipped`, the ones
   *  chosen that couldn't be read: whether Civilization II's map art is complete, or the sheets still to import. Says
   *  nothing for a pack with nothing to say. Resolves with whether any is still to be finished.
   */
  async #showStatus(
    packs: PackImport[],
    skipped: { [id: string]: string[] }
  ): Promise<boolean> {
    const statuses = await Promise.all(
        packs.map(
          (pack) =>
            pack.status?.(skipped[pack.id] ?? []) ??
            Promise.resolve({ lines: [], incomplete: false })
        )
      ),
      lines = statuses.flatMap(({ lines }) => lines);

    this.#packStatus.textContent = lines.join(' ');
    this.#packStatus.toggleAttribute('hidden', lines.length === 0);

    return statuses.some(({ incomplete }) => incomplete);
  }

  /**
   * ASOUND.CVL as a record to store, once `cvl/Image` has read it as the AdLib driver (#126), or nothing if it wasn't
   *  chosen. Rejects, naming the file, when it isn't the driver.
   */
  async #sound(file: File | undefined): Promise<Asset[]> {
    if (file === undefined) {
      return [];
    }

    let bytes: ArrayBuffer;

    try {
      bytes = await file.arrayBuffer();
      new CvlImage(bytes);
    } catch (cause) {
      throw unsupportedFile(
        file.name,
        `${file.name} is not the AdLib sound driver`,
        cause
      );
    }

    return [
      {
        name: SOUND_DRIVER,
        blob: new Blob([bytes], { type: 'application/octet-stream' }),
      },
    ];
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

  /** Lets the player choose files again: after a failed import, or one that left a pack's art incomplete. */
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
