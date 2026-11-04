import {
  Definition,
  ExtractData,
  ImageMap,
  extractSprites,
} from '@civ-clone/civ1-asset-extractor/extractSprites';
import { Asset, SOUND_DRIVER, assetFromURI, assetStore } from '../AssetStore';
import CvlImage from '../../Audio/cvl/Image';
import Window from './Window';
import { allowLeaving } from '../lib/leaveGuard';
import { button } from '../lib/button';
import extractData from '@civ-clone/civ1-asset-extractor/extract-data.json';
import { h } from '../lib/html';
import { s, t as textNode } from '@dom111/element';
import { t } from 'i18next';

// The files an import needs, and the ones it takes when they're chosen (#64): the extractor lists those as `optional`.
const optionalFiles = (extractData as ExtractData).optional ?? [],
  requiredFiles = Object.keys(extractData.files).filter(
    (file) => !optionalFiles.includes(file)
  ),
  // Civilization's AdLib sound driver, kept as it is for the music (#126) rather than cut up.
  soundFile = 'ASOUND.CVL',
  isSoundFile = (file: File): boolean => file.name.toUpperCase() === soundFile;

export class ImportAssetsWindow extends Window {
  // The browser's own file input can't take the theme (#739): it stays, hidden, and this button opens it.
  #fileInput: HTMLInputElement;
  #chooseButton: HTMLButtonElement;
  #chosen: HTMLSpanElement;
  #progressInformation: HTMLParagraphElement;
  // Read when the files arrive, not copied on change: a copy started out of
  // step with the box as drawn (#341).
  #replaceExistingInput: HTMLInputElement;

  constructor() {
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
      );

    super(
      t('ImportAssetsWindow.title'),
      s(
        `<div class="import-assets"><p>${t('ImportAssetsWindow.instructions', {
          files: requiredFiles,
        })}${
          optionalFiles.length
            ? ` ${t('ImportAssetsWindow.optional', { files: optionalFiles })}`
            : ''
        } ${t('ImportAssetsWindow.optional-sound', {
          file: soundFile,
        })}</p><div class="brave" ${
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
        progressInformation
      )
    );

    this.#fileInput = fileInput;
    this.#chooseButton = chooseButton;
    this.#chosen = chosen;
    this.#replaceExistingInput = replaceExistingInput;
    this.#progressInformation = progressInformation;
  }

  async handleFileUpload(event: InputEvent) {
    this.#progressInformation.removeAttribute('hidden');
    this.#progressInformation.classList.remove('failed');

    const files = Array.from(
        (event.target as HTMLInputElement).files ?? []
      ) as File[],
      filenames: string[] = files.map((file: File) => file.name),
      expectedFilenames = requiredFiles,
      expectedMatches = expectedFilenames.map((key) => new RegExp(key, 'i')),
      // ASOUND.CVL alone is enough once the sprites are in (#126): the music can be added later.
      addingSound =
        files.some(isSoundFile) &&
        (await assetStore.hasAllAssets().catch((): boolean => false));

    if (
      !addingSound &&
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

    let results: ImageMap[];

    try {
      // Every file, read and its sprites extracted.
      results = (
        await Promise.all(
          files
            .filter((file) => !isSoundFile(file))
            .map((file) =>
              this.#extract(
                file,
                existingKeys,
                replaceExisting,
                progress,
                wanted
              )
            )
        )
      ).flat();
    } finally {
      extracting = false;
    }

    this.#progressInformation.innerText = t(
      'ImportAssetsWindow.progress-writing'
    );

    // ...and all results stored in IDB, in a single transaction, each as its PNG rather than the data URI the
    //  extractor gives (#730).
    await assetStore.setAll([
      ...(await Promise.all(
        results.map(({ name, uri }) => assetFromURI(name, uri))
      )),
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

    // We need to reprocess everything and this is the lazy way...
    allowLeaving();

    location.reload();
  }

  /**
   * Reads `file` and cuts out the sprites it holds that are wanted: all of
   * them with `replaceExisting`, otherwise only the groups with a sprite the
   * store doesn't have yet (so a re-import picks up sprites added to the
   * extractor since). Rejects, naming the file, when it can't be read, and
   * resolves with nothing once the file is no longer `wanted`.
   */
  #extract(
    file: File,
    existingKeys: string[],
    replaceExisting: boolean,
    progress: (message: string) => void,
    wanted: () => boolean
  ): Promise<ImageMap[]> {
    const allDefinitions = (extractData as ExtractData).files[
      file.name.toUpperCase()
    ];

    if (!allDefinitions) {
      console.warn(`No definitions found for ${file.name}, skipping.`);

      return Promise.resolve([]);
    }

    const definitions = Object.keys(allDefinitions).reduce((object, key) => {
      // `key` is the sprites' path ("units/"), and each of its definitions names some of them: the index of the
      //  definition isn't part of it, which made this never match, so nothing already imported was ever skipped.
      const filenamesForObject = allDefinitions[key].flatMap((definition) =>
        definition.contents.map((entry) => `./assets/${key + entry.name}.png`)
      );

      if (
        filenamesForObject.every((path) => existingKeys.includes(path)) &&
        !replaceExisting
      ) {
        return object;
      }

      object[key] = allDefinitions[key];

      return object;
    }, {} as Definition);

    return new Promise<ImageMap[]>((resolve, reject) => {
      const reader = new FileReader(),
        failed = (cause: unknown) =>
          reject(
            Object.assign(
              new Error(`Could not extract sprites from ${file.name}`, {
                cause,
              }),
              { file: file.name }
            ) as UnsupportedFile
          );

      reader.addEventListener('error', () => failed(reader.error));
      reader.addEventListener('load', () => {
        // The import failed on another file while this one was being read.
        if (!wanted()) {
          resolve([]);

          return;
        }

        try {
          resolve(
            extractSprites(
              reader.result as string,
              definitions,
              extractData.defaults,
              (width, height) => {
                const canvas = document.createElement('canvas');

                canvas.width = width;
                canvas.height = height;

                return canvas;
              },
              progress
            )
          );
        } catch (error) {
          failed(error);
        }
      });

      reader.readAsBinaryString(file);
    });
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
      throw Object.assign(
        new Error(`${file.name} is not the AdLib sound driver`, { cause }),
        { file: file.name }
      ) as UnsupportedFile;
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
    this.#fileInput.removeAttribute('disabled');
    this.#chooseButton.disabled = false;
    // So choosing the same files again counts as a change.
    this.#fileInput.value = '';
    this.#showChosen([]);
  }
}

/** The error `#extract` rejects with: which file it was that couldn't be read. */
type UnsupportedFile = Error & { file: string };

const isUnsupportedFile = (error: unknown): error is UnsupportedFile =>
  error instanceof Error && typeof (error as UnsupportedFile).file === 'string';

export default ImportAssetsWindow;
