import {
  ExtractData,
  extractSprites,
} from '@civ-clone/civ1-asset-extractor/extractSprites';
import Window from './Window';
import { assetStore } from '../AssetStore';
import extractData from '@civ-clone/civ1-asset-extractor/extract-data.json';
import { h } from '../lib/html';
import { s } from '@dom111/element';
import { t } from 'i18next';

export class ImportAssetsWindow extends Window {
  #fileInput: HTMLInputElement;
  #progressInformation: HTMLParagraphElement;

  constructor() {
    const fileInput = s<HTMLInputElement>('<input type="file" multiple>'),
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
          h(fileInput, {
            change: (event) => this.handleFileUpload(event),
          })
        ),
        progressInformation
      )
    );

    this.#fileInput = fileInput;
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
      this.#progressInformation.style.color = '#f00';
      this.#progressInformation.innerText = t(
        'ImportAssetsWindow.missing-files',
        {
          files: expectedFilenames,
        }
      );

      return;
    }

    this.#fileInput.setAttribute('disabled', '');
    this.#progressInformation.innerText = t(
      'ImportAssetsWindow.progress-building'
    );

    const results: { name: string; uri: string }[] = [];

    // Wait for...
    await Promise.all(
      // ...all files...
      files.map(
        async (file: File) =>
          // ...to have been...
          new Promise<void>((resolve) => {
            const definitions = (extractData as ExtractData).files[
              file.name.toUpperCase()
            ];

            if (!definitions) {
              console.warn(`No definitions found for ${file.name}, skipping.`);

              return;
            }

            const reader = new FileReader();

            // ...loaded...
            reader.addEventListener('load', async (event) => {
              // ...the sprites extracted...
              extractSprites(
                event.target!.result as string,
                definitions,
                extractData.defaults,
                (width, height) => {
                  const canvas = document.createElement(
                    'canvas'
                  ) as HTMLCanvasElement;

                  canvas.width = width;
                  canvas.height = height;

                  return canvas;
                },
                (message) => {
                  this.#progressInformation.innerText = message;
                }
              ).forEach((record) => results.push(record));

              resolve();
            });

            reader.readAsBinaryString(file);
          })
      )
    );

    this.#progressInformation.innerText = t(
      'ImportAssetsWindow.progress-writing'
    );

    // ...and all results stored in IDB.
    await Promise.all(results.map((record) => assetStore.set(record)));

    if (!(await assetStore.hasAllAssets())) {
      console.error('Something went wrong...');

      this.#progressInformation.style.color = '#f00';
      this.#progressInformation.innerText = t(
        'ImportAssetsWindow.missing-data',
        {
          files: await assetStore.missingAssets(),
        }
      );

      this.#fileInput.removeAttribute('disabled');

      return;
    }

    this.#progressInformation.innerText = t('ImportAssetsWindow.done');

    // We need to reprocess everything and this is the lazy way...
    location.reload();
  }
}

export default ImportAssetsWindow;
