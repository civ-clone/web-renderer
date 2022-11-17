import {
  ExtractData,
  extractSprites,
} from '@civ-clone/civ1-asset-extractor/extractSprites';
import { e, h, t } from '../lib/html';
import Window from './Window';
import { assetStore } from '../AssetStore';
import extractData from '@civ-clone/civ1-asset-extractor/extract-data.json';

export class ImportAssetsWindow extends Window {
  #fileInput: HTMLInputElement;
  #progressInformation: HTMLParagraphElement;

  constructor() {
    const fileInput = e<HTMLInputElement>('input[type="file"][multiple]'),
      progressInformation = e<HTMLParagraphElement>('p.loading[hidden]');

    super(
      'Import assets',
      e(
        'div.import-assets',
        e(
          'p',
          t(
            `Upload ${Object.keys(extractData.files).join(
              ', '
            )} from the original Civilization files to extract assets (these will be stored locally). This process can take at least a few minutes.`
          )
        ),
        e(
          // @ts-ignore
          'div.brave' + (navigator?.brave ? '' : '[hidden]'),
          e(
            'p',
            t(`It looks like you're using Brave and due to the use of `),
            e('code', t('HTMLCanvasElement')),
            t(`\'s `),
            e('code', t('getImageData')),
            t(' and '),
            e('code', t('toDataURL')),
            t(
              ` functions, please put Shields down while importing, and playing, otherwise any colour-replaced icons won't look correct. `
            ),
            e('strong', t('Remember to put them back up after!'))
          ),
          e(
            'p',
            e(
              'a[href="https://brave.com/privacy-updates/4-fingerprinting-defenses-2.0/#2-fingerprinting-protections-20-farbling-for-great-good"][target="_blank"]',
              t('Read more about "farbling".')
            )
          )
        ),
        e(
          'p',
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
    this.#fileInput.setAttribute('disabled', '');
    this.#progressInformation.removeAttribute('hidden');
    this.#progressInformation.innerText = 'Building image assets...';

    const files = Array.from(
        (event.target as HTMLInputElement).files ?? []
      ) as File[],
      filenames: string[] = files.map((file: File) => file.name),
      expectedMatches = Object.keys(extractData.files).map(
        (key) => new RegExp(key, 'i')
      );

    if (
      !expectedMatches.every((expectedMatch) =>
        filenames.some((filename) => filename.match(expectedMatch))
      )
    ) {
      console.error(
        `Please provide ${filenames.join(', ')} to process the assets.`
      );

      return;
    }

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

    this.#progressInformation.innerText = 'Writing to database...';

    // ...and all results stored in IDB.
    await Promise.all(results.map((record) => assetStore.set(record)));

    if (!(await assetStore.hasAllAssets())) {
      console.error('Something went wrong...');
      this.#progressInformation.style.color = '#f00';
      this.#progressInformation.innerText =
        'Not all expected data was written. Might need to try again... Missing: ' +
        (await assetStore.missingAssets()).join(', ');

      this.#fileInput.removeAttribute('disabled');

      return;
    }

    this.#progressInformation.innerText =
      'Done! Please reload the page to utilise the fresh assets.';

    // We need to reprocess everything and this is the lazy way...
    location.reload();
  }
}

export default ImportAssetsWindow;
