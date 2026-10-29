import {
  Definition,
  ExtractData,
  ImageMap,
  extractSprites,
} from '@civ-clone/civ1-asset-extractor/extractSprites';
import Window from './Window';
import { allowLeaving } from '../lib/leaveGuard';
import { assetStore } from '../AssetStore';
import extractData from '@civ-clone/civ1-asset-extractor/extract-data.json';
import { h } from '../lib/html';
import { s, t as textNode } from '@dom111/element';
import { t } from 'i18next';

export class ImportAssetsWindow extends Window {
  #fileInput: HTMLInputElement;
  #progressInformation: HTMLParagraphElement;
  // Read when the files arrive, not copied on change: a copy started out of
  // step with the box as drawn (#341).
  #replaceExistingInput: HTMLInputElement;

  constructor() {
    const fileInput = s<HTMLInputElement>('<input type="file" multiple>'),
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
          files: Object.keys(extractData.files),
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
          '<p></p>',
          h(fileInput, {
            change: (event) => this.handleFileUpload(event),
          })
        ),
        progressInformation
      )
    );

    this.#fileInput = fileInput;
    this.#replaceExistingInput = replaceExistingInput;
    this.#progressInformation = progressInformation;
  }

  async handleFileUpload(event: InputEvent) {
    this.#progressInformation.removeAttribute('hidden');
    this.#progressInformation.style.color = 'inherit';

    const files = Array.from(
        (event.target as HTMLInputElement).files ?? []
      ) as File[],
      filenames: string[] = files.map((file: File) => file.name),
      expectedFilenames = Object.keys(extractData.files),
      expectedMatches = expectedFilenames.map((key) => new RegExp(key, 'i'));

    if (
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
    this.#progressInformation.innerText = t(
      'ImportAssetsWindow.progress-building'
    );

    const existingKeys = await assetStore.keys(),
      replaceExisting = this.#replaceExistingInput.checked;

    // A file still being extracted after another has failed would write its
    //  progress over the reason the import stopped.
    let stopped = false;

    const progress = (message: string): void => {
      if (!stopped) {
        this.#progressInformation.innerText = message;
      }
    };

    let results: ImageMap[];

    try {
      // Every file, read and its sprites extracted.
      results = (
        await Promise.all(
          files.map((file) =>
            this.#extract(file, existingKeys, replaceExisting, progress)
          )
        )
      ).flat();
    } catch (error) {
      // A file the extractor can't read (not a Civilization sheet, or one
      //  cut differently from the originals) used to throw inside the
      //  reader's `load` listener, where nothing caught it: the promise never
      //  settled and the window sat on "Building image assets..." for good.
      stopped = true;
      console.error(error);

      this.#fail(
        t('ImportAssetsWindow.unsupported-file', {
          file: (error as UnsupportedFile).file ?? '',
        })
      );

      return;
    }

    this.#progressInformation.innerText = t(
      'ImportAssetsWindow.progress-writing'
    );

    // ...and all results stored in IDB, in a single transaction.
    await assetStore.setAll(results);

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
   * extractor since). Rejects, naming the file, when it can't be read.
   */
  #extract(
    file: File,
    existingKeys: string[],
    replaceExisting: boolean,
    progress: (message: string) => void
  ): Promise<ImageMap[]> {
    const allDefinitions = (extractData as ExtractData).files[
      file.name.toUpperCase()
    ];

    if (!allDefinitions) {
      console.warn(`No definitions found for ${file.name}, skipping.`);

      return Promise.resolve([]);
    }

    const definitions = Object.keys(allDefinitions).reduce((object, key) => {
      const filenamesForObject = Object.entries(allDefinitions[key]).reduce(
        (paths, [path, definition]) => {
          definition.contents.forEach((entry) =>
            paths.push(`./assets/${path + entry.name}.png`)
          );

          return paths;
        },
        [] as string[]
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

  /** Shows `message` as the reason the import stopped, and lets the player choose files again. */
  #fail(message: string): void {
    this.#progressInformation.style.color = '#f00';
    this.#progressInformation.innerText = message;
    this.#fileInput.removeAttribute('disabled');
    // So choosing the same files again counts as a change.
    this.#fileInput.value = '';
  }
}

/** The error `#extract` rejects with: which file it was that couldn't be read. */
type UnsupportedFile = Error & { file: string };

export default ImportAssetsWindow;
